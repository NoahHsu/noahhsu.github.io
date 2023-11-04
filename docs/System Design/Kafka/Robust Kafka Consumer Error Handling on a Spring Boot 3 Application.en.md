---
tags:
- Kafka
- Distributed Systems
- Spring Boot
---

# Robust Kafka Consumer Error Handling on a Spring Boot 3 Application

###### Achieving dead letter queue, blocking and non-blocking retry mechanisms by using RetryableTopic annotation


![Kafka-Cover.jpg](assets%2FKafka-Cover.jpg)

In the [previous article](https://noahhsu.github.io/System%20Design/Kafka/Get%20Kafka%20in%20prod-ready%2C%202%20decisions%20to%20make%20and%203%20implementation%20details/) I shared before, I didn’t show how to implement the error handling in the Kafka consumer for our spring boot application. Since the missing piece is so essential, here I wrote a new article to show how to do the following stuff:

1. **Blocking retry** <br>
Do retry when retriable exceptions occur during consuming a message, and block the next message.
2. **Non-blocking retry** <br>
Send the message to another retry topic, when the message exceeds the blocking retry max attempts limit.
3. **Dead letter queue and handler** <br>
Send the message to another dead letter topic, when the message exceeds the non-blocking retry max attempts limit or the exception is not a retryable exception.

Before we start, If you want to learn the basic components and concepts of Kafka, How to achieve the desired performance and message guarantee level, please visit my previous article: [Get Kafka in prod-ready, 2 decisions to make and 3 implementation details]((https://noahhsu.github.io/System%20Design/Kafka/Get%20Kafka%20in%20prod-ready%2C%202%20decisions%20to%20make%20and%203%20implementation%20details/).

If you are interested in the coding detail, please refer to [the PR in my POC project](https://github.com/NoahHsu/event-sourcing-order-poc/pull/59) .

Let’s start!

---

## Default Behavior
Given a simple `KafkaListener` method (setting as manual commit acknowledge):

```java
@KafkaListener(topics = ORDER_TOPIC, groupId = ORDER_STATUS_GROUP_ID_PREFIX + "#{ T(java.util.UUID).randomUUID().toString() }")
@Transactional
public void orderEventListener(OrderEvent orderEvent, Acknowledgment ack) {
    log.info("ORDER_TOPIC handler receive data = {}", orderEvent);
    try {
        orderEventRecordHandler.onEvent(orderEvent);
        orderRecordHandler.onEvent(orderEvent);
        ack.acknowledge();
    } catch (Exception e) {
        log.warn("Fail to handle event {}.", orderEvent);
        throw e;
    }
}
```

The default behavior is attempting to consume one massage at most 10 times, then consume the next message and print an error log if it still fails. Please see the `org.springframework.kafka.listener.DefaultErrorHandler` for details.

```java title="DefaultErrorHandler.java"
public class DefaultErrorHandler extends FailedBatchProcessor implements CommonErrorHandler {

   private boolean ackAfterHandle = true;

   /**
    * Construct an instance with the default recoverer which simply logs the record after
    * {@value SeekUtils#DEFAULT_MAX_FAILURES} (maxFailures) have occurred for a
    * topic/partition/offset, with the default back off (9 retries, no delay).
    */
   public DefaultErrorHandler() {
      this(null, SeekUtils.DEFAULT_BACK_OFF);
   }
   ...
}
```

and the log is like:

```text
2023-06-03T08:57:16.573Z ERROR [order-query-side,,] 1 --- [org.springframework.kafka.KafkaListenerEndpointContainer#0-0-C-1] 
o.s.kafka.listener.DefaultErrorHandler   : Backoff FixedBackOff {interval=0, currentAttempts=10, maxAttempts=9} exhausted for ORDER-0@0
```

After the message is skipped, then the consumer will never process it again. But not skipping this error will make the service stuck at this message which could be unprocessable. So we need to add some non-blocking retry mechanism to get our application more robust under this eventual consistency concept.

## Non-Blocking Retry
The easier way to do so is to use the `@RetryableTopic` (avaliable after springframework.kafka 2.7), comparing to building the retry topic by ourselves and sending messages to it when catch an exception (refer to this [commit](https://github.com/NoahHsu/event-sourcing-order-poc/pull/59/commits/228d87b693ad1f233231337918e31ca5305d4d96)).

With `@RetryableTopic`, it will build the retry topics for you with the broker default setting. It might create multiple topics if we retry many times and every time will send to a different topic (can be configured with `fixedDelayTopicStrategy` property), like `origintopic-retry-1`, `origintopic-retry-2`…. The whole setting will look like this:

```java
@RetryableTopic(kafkaTemplate = "kafkaTemplate",
        attempts = "4",
        backoff = @Backoff(delay = 3000, multiplier = 1.5, maxDelay = 15000)
)
@KafkaListener(topics = ORDER_TOPIC, groupId = ORDER_STATUS_GROUP_ID_PREFIX + "#{ T(java.util.UUID).randomUUID().toString() }")
@Transactional
public void orderEventListener(@Header(KafkaHeaders.RECEIVED_TOPIC) String receivedTopic,
                               OrderEvent orderEvent, Acknowledgment ack) throws SocketException {
    log.info("Topic({}) handler receive data = {}", receivedTopic, orderEvent);
    try {
        orderEventRecordHandler.onEvent(orderEvent);
        if (receivedTopic.contains("retry")) {
            orderRecordHandler.onRequeueEvent(orderEvent);
        } else {
            orderRecordHandler.onEvent(orderEvent);
        }
        ack.acknowledge();
    } catch (Exception e) {
        log.warn("Fail to handle event {}.", orderEvent);
        throw e;
    }
}
```

There are plenty of properties we can set to control the behavior of retry like max attempts, retry interval, retriable exception, retry topic naming strategy, etc. Please refer to the [document](https://docs.spring.io/spring-kafka/reference/html/#features) for features of `org.springframework.kafka.annotation.RetryableTopic`

In this way, this KafkaListener method will consume messages from both the original topic and the retry topic. If you really want to distinguish the different logic of the original and retry one, we can get this information from `@Header(KafkaHeaders.RECEIVED_TOPIC) String receivedTopic`. Using other KafkaHeader can also achieve other use cases.

## Dead letter queue and handler
In some cases, the message is definitely unprocessable (like parsing error, or invalid properties…). Then we should not waste our resources trying to consume it.

we can use the include and exclude properties to control which exception should/should not be retried like:

```java
@RetryableTopic(kafkaTemplate = "kafkaTemplate",
        exclude = {DeserializationException.class,
                MessageConversionException.class,
                ConversionException.class,
                MethodArgumentResolutionException.class,
                NoSuchMethodException.class,
                ClassCastException.class},
        attempts = "4",
        backoff = @Backoff(delay = 3000, multiplier = 1.5, maxDelay = 15000)
)
```

And we should write a dead letter handler in the same class of the KafkaListener method like:

```java
@DltHandler
public void processMessage(OrderEvent message) {
    log.error("DltHandler processMessage = {}", message);
}
```

then them will work as expected.

## Blocking Retry
Before we send the fail-processed message to the retry topic, we might want to retry a couple of times to save some network round trip. There are plenty of ways to change the default behavior likes:

1. provide your own `@Bean` of `KafkaListenerErrorHandler`
2. provide your own `@Bean` of `DefaultErrorHandler`
   with different `ConsumerRecordRecoverer` (instead of just printing error logs) and different `BackOff` settings to customize attempts and retry intervals.
3. When Using `@RetryableTopic` for methods annotated with KafkaListener, provide a `@Configuration` class extends `RetryTopicConfigurationSupport`.

The former 2 ways are not well integrated with a non-blocking retry mechanism, so I recommend the third way to do so.

When we have a `@RetryableTopic` on our KafkaListener like the sample code of the above section, then we just add a configuration class like:

```java title="KafkaConfig.java"
@Configuration
@RequiredArgsConstructor
@EnableScheduling
@Slf4j
public class KafkaConfig extends RetryTopicConfigurationSupport {

    @Override
    protected void configureBlockingRetries(BlockingRetriesConfigurer blockingRetries) {
        blockingRetries
                .retryOn(IOException.class)
                .backOff(new FixedBackOff(5000, 3));
    }

}
```

Note that I encounter an error when I first try without `@EnableScheduling` like the below:

```text
Caused by: java.lang.IllegalArgumentException: 
Either a RetryTopicSchedulerWrapper or TaskScheduler bean is required
```

And I found this issue in StackOverflow, but I think the better solution is to delegate this implementation detail to the spring framework. So the `@EnableScheduling` is essential.

---

## Summary
In this article, we address the need for blocking retry, non-blocking retry, and dead letter queue mechanisms. Exploring the implementation of error handling in a Kafka consumer for a Spring Boot application and introducing the RetryableTopic annotation as a solution.

I’ve opened the related Pull Request (PR) in my personal repository, feel free to get more details and the complete code [here](https://github.com/NoahHsu/event-sourcing-order-poc/pull/59).

### Reference
1. [https://docs.spring.io/spring-kafka/reference/html/#retry-topic](https://docs.spring.io/spring-kafka/reference/html/#retry-topic)
2. [https://docs.spring.io/spring-kafka/reference/html/#annotation-error-handling](https://docs.spring.io/spring-kafka/reference/html/#annotation-error-handling)