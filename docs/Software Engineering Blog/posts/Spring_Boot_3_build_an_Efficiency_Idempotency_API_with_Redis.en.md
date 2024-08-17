---
date:
  created: 2024-01-26
authors:
  - NoahHsu
categories:
  - Spring Boot
tags:
  - Java
  - Idempotent API
  - Distributed Systems
  - Data Consistency
---
# Spring Boot 3: build the efficiency Idempotent API by Redis

Idempotency API means that the **data / system state will be the same no matter how many times the API is successfully
called** with the same request body/parameter.

We've described why we need and how to design an idempotency API mechanism in the
article [How to design an efficient Idempotency API](https://medium.com/gitconnected/how-to-design-an-efficient-idempotency-api-e664fa2954bb),
If you haven't read it before, please refer to it.

This article will focus on implementing it in an existing project, which is
my [event-sourcing POC project](https://github.com/NoahHsu/event-sourcing-order-poc).
Here are the implementing steps:

<!-- more -->

1. create and use the shared module
2. implement the idempotency mechanism
3. modify the original service logic
4. demonstrate the result

---

## Create and use the shared module

Since [my project](https://github.com/NoahHsu/event-sourcing-order-poc) is like
a [mono-repo](https://en.wikipedia.org/wiki/Monorepo), and for the convenience of reusing in different application
modules, we need to create a shared module named `idempotency` and then we can also make use of the technique of spring
autoconfiguration (please refer to my other article for more
detail [Auto-configure your common module in the “Spring-Boot-Way”](https://medium.com/spring-boot/auto-configure-your-common-module-in-the-spring-boot-way-32acd3976a70)).

First, we create a module, `idempotency` under the `modules` with this `build.gradle`:

```groovy title="modules/idempotency/build.gradle"
dependencies {
    implementation 'org.springframework.boot:spring-boot-starter'
    implementation "org.springframework.boot:spring-boot-starter-aop"
    implementation 'org.springframework.boot:spring-boot-starter-web'
    implementation 'org.springframework.boot:spring-boot-starter-data-redis'

    testImplementation 'org.springframework.boot:spring-boot-starter-test'
    testImplementation 'org.junit.jupiter:junit-jupiter-api'
    testRuntimeOnly 'org.junit.jupiter:junit-jupiter-engine'
}

bootJar {
    enabled = false
}

jar {
    enabled = true
}

tasks.findAll { it.name.startsWith("jib") }.forEach { it.enabled = false }
```

Then, create
the [IdempotencyFilter](https://github.com/NoahHsu/event-sourcing-order-poc/blob/9bea0389c41396058bd6b61fa3016306dbc1aeab/modules/idempotency/src/main/java/org/example/event/sourcing/order/poc/modules/idempotency/filter/IdempotenceFilter.java#L31)
and [IdempotencyConfig](https://github.com/NoahHsu/event-sourcing-order-poc/blob/9bea0389c41396058bd6b61fa3016306dbc1aeab/modules/idempotency/src/main/java/org/example/event/sourcing/order/poc/modules/idempotency/config/IdempotencyConfig.java) (
ignore some code here, please use the link to check the complete code.).

```java title="IdempotencyFilter.java"

@Slf4j
@RequiredArgsConstructor
public class IdempotenceFilter extends OncePerRequestFilter {
    // implement this class in second step
}
```

```java title="IdempotencyConfig.java"
package org.example.event.sourcing.order.poc.modules.idempotency.config;

...

@AutoConfiguration
public class IdempotencyConfig {

    @Value("${espoc.idempotency.paths}")
    private List<String> idempotencyApiPaths;

    @Value("${espoc.idempotency.ttlInMinutes:60}")
    private Long ttlInMinutes;

    @Bean
    RedisTemplate<String, IdempotenceFilter.IdempotencyValue> redisTemplate(RedisConnectionFactory redisConnectionFactory) {
        StringRedisSerializer stringRedisSerializer = new StringRedisSerializer();
        Jackson2JsonRedisSerializer jackson2JsonRedisSerializer =
                new Jackson2JsonRedisSerializer(IdempotenceFilter.IdempotencyValue.class);

        RedisTemplate<String, IdempotenceFilter.IdempotencyValue> template = new RedisTemplate<>();
        template.setConnectionFactory(redisConnectionFactory);

        template.setKeySerializer(stringRedisSerializer);
        template.setValueSerializer(jackson2JsonRedisSerializer);

        template.setHashKeySerializer(stringRedisSerializer);
        template.setHashValueSerializer(jackson2JsonRedisSerializer);

        return template;
    }

    @Bean
    public FilterRegistrationBean<IdempotenceFilter> idempotenceFilterRegistrationBean(
            RedisTemplate<String, IdempotenceFilter.IdempotencyValue> redisTemplate) {

        FilterRegistrationBean<IdempotenceFilter> registrationBean = new FilterRegistrationBean();

        IdempotenceFilter idempotenceFilter = new IdempotenceFilter(redisTemplate, ttlInMinutes);

        registrationBean.setFilter(idempotenceFilter);
        registrationBean.addUrlPatterns(idempotencyApiPaths.toArray(String[]::new));
        registrationBean.setOrder(1); //make sure the idempotency-filter is after all auth-related filter
        return registrationBean;
    }

}
```

Second, add a file named `org.springframework.boot.autoconfigure.AutoConfiguration.imports` under
the `modules/idempotency/src/main/resources/META-INF/spring` as below:

```text
org.example.event.sourcing.order.poc.modules.idempotency.config.IdempotencyConfig
```

This setting can let the spring boot auto-scan the `@AutoConfiguration` class we specify in the file. The only thing to
do is to import this module in the target application module (in our case is the order-command-side app):

```groovy title="order/command-side/build.gradle"
...

dependencies {
    ...
    implementation project(":modules:idempotency")

    ...
}
```

Finally, we use the profile mechanism to include the related config, we should add two config
files, `application-redis.yaml` and `application-idempotency.yaml`:

```yaml title="applicatio-redis.yaml"
spring:
  data:
    redis:
      host: ${REDIS_HOST:127.0.0.1}
      port: ${REDIS_PORT:6379}
```

```yaml title="application-idempotency.yaml"
espoc:
  idempotency:
    paths: >
      /api/v1/orders,
      /api/v1/orders/complete
    ttlInMinutes: 120
```

Then, please make sure these yaml are included in the config location, then we can add it in the
main/resources/application.yaml for order/command-side module as below:

```yaml
spring:
  ...
  profiles:
    include:
      ...
      - redis
      - idempotency
```

After all these settings, the filter is added to the filter chain, we are ready to implement the logic of idempotency
filter.

---

## Implement the idempotency mechanism

In this step, we have some challenges such as:

- Avoid cache-key conflicting
- Avoid a race condition when initializing the cache as in progress
- How to cache the response body from an OutputStream
- How to properly respond when cache exists

we will go through them one by one. (get a glance first at the complete code
in [here](https://github.com/NoahHsu/event-sourcing-order-poc/blob/master/modules/idempotency/src/main/java/org/example/event/sourcing/order/poc/modules/idempotency/filter/IdempotenceFilter.java))

before the idempotency logic truly starts, we should first pass some checks, (all logic is implemented in
the `doFilterInternal` method)

```java

@Slf4j
@RequiredArgsConstructor
public class IdempotenceFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        log.debug("start IdempotenceFilter");

        String method = request.getMethod();
        String requestId = request.getHeader(REQUEST_ID_KEY);
        String clientId = request.getHeader(CLIENT_ID_KEY);

        if (isNotTargetMethod(method)) {
            log.info("Request method {} didn't match the target idempotency https method.", method);
            filterChain.doFilter(request, response);
        } else if (StringUtils.isBlank(requestId)
                || StringUtils.isBlank(clientId)) {
            log.warn("Request should bring a RequestId and ClientId in header, but no. get rid = {}, cid = {}.", requestId, clientId);
            filterChain.doFilter(request, response);
        } else {
            // idempotency logic 
        }
    }

    private boolean isNotTargetMethod(String method) {
        return !HttpMethod.POST.matches(method);
    }
}
```

### Avoid cache-key conflicting

As a filter that covers different endpoints of our service. The last thing we want is to miss-place the cached response
to the wrong request (e.g. response of `POST /order/create` is returned to a request to `POST /order/cancel` only since
they have the same requestId).

so we should also consider the `request method` (if we want to cover not only the `POST`
method), `request URI`, `client id` ( which is the id of the client or service that integrates our API), and the
`request-id` (which is generated by the client itself to denote its retry call).

```java

@Slf4j
@RequiredArgsConstructor
public class IdempotenceFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        // define other variables
        String cacheKey = join(DELIMITER, method, request.getRequestURI(), clientId, requestId);

        if (isNotTargetMethod(method)) {
            // invalid http method
        } else if (StringUtils.isBlank(requestId)
                || StringUtils.isBlank(clientId)) {
            // invalid header
        } else {
            BoundValueOperations<String, IdempotencyValue> keyOperation = redisTemplate.boundValueOps(cacheKey);
            // idempotency logic
        }
    }
}
```

Here, we simply combine all four parts as a cacheKey for later use.

### Avoid a race condition when initializing the cache as in-progress

The first challenge is to make sure the first request will create a cache noted as in-progress, so the following retry
request will get an in-progress response instead of executing the business logic. so we design the Redis
value data structure as follows:

```java
public record IdempotencyValue(Map<String, Object> header, int status, String cacheValue, boolean isDone) {

    protected static IdempotencyValue init() {
        return new IdempotencyValue(Collections.emptyMap(), 0, "", false);
    }

    protected static IdempotencyValue done(Map<String, Object> header, Integer status, String cacheValue) {
        return new IdempotencyValue(header, status, cacheValue, true);
    }

}
```

Then, we use the `BoundValueOperations::setIfAbsent` in `spring-data-redis`, which makes use of the `SETNX key value` in
Redis.

```java

@Slf4j
@RequiredArgsConstructor
public class IdempotenceFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        // define variables

        if (isNotTargetMethod(method)) {
            // invalid http method
        } else if (StringUtils.isBlank(requestId)
                || StringUtils.isBlank(clientId)) {
            // invalid header
        } else {
            log.info("requestId and clientId not empty, rid = {}, cid = {}", requestId, clientId);
            BoundValueOperations<String, IdempotencyValue> keyOperation = redisTemplate.boundValueOps(cacheKey);
            boolean isAbsent = keyOperation.setIfAbsent(IdempotencyValue.init(), ttl, TimeUnit.MINUTES);
            if (isAbsent) {
                // if cache is not exist
            } else {
                // if cache is exist
            }
        }
    }
}
```

The function is designed to initialize the value when the query indicates that the key does not exist in a single
thread.
This process occurs sequentially and is synchronized. Meanwhile, any other queries for the same key will be temporarily
blocked by Redis, given its single-threaded nature, ensuring a consistent and ordered execution of operations.

combining the two traits above, we can make sure no race condition would happen in the key creation phase.

### How to cache the response body from an OutputStream

The default `HttpServletResponse` only allows a one-time read of the response body. Fortunately, Spring Boot provides
a `ContentCachingResponseWrapper`, that makes it easy to read the response body multiple times. We only need to wrap the
original response into it and pass it to the next filters and controller.

```java

@Slf4j
@RequiredArgsConstructor
public class IdempotenceFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        // define variables

        if (isNotTargetMethod(method)) {
            // invalid http method
        } else if (StringUtils.isBlank(requestId)
                || StringUtils.isBlank(clientId)) {
            // invalid header
        } else {
            // ... skip some code here
            boolean isAbsent = keyOperation.setIfAbsent(IdempotencyValue.init(), ttl, TimeUnit.MINUTES);
            if (isAbsent) {
                log.info("cache {} not exist ", cacheKey);
                ContentCachingResponseWrapper responseCopier = new ContentCachingResponseWrapper(response);

                filterChain.doFilter(request, responseCopier); // execute the original business logic

                updateResultInCache(request, responseCopier, keyOperation);
                responseCopier.copyBodyToResponse();
            } else {
                // if cache is exist
            }
        }
    }

    private void updateResultInCache(HttpServletRequest request, ContentCachingResponseWrapper responseCopier,
                                     BoundValueOperations<String, IdempotencyValue> keyOperation)
            throws UnsupportedEncodingException {
        if (needCache(responseCopier)) {
            log.info("process result need to be cached");
            String responseBody = new String(responseCopier.getContentAsByteArray(), responseCopier.getCharacterEncoding());
            IdempotencyValue result = IdempotencyValue.done(Collections.emptyMap(), responseCopier.getStatus(), responseBody);

            log.info("save {} to redis", result);
            keyOperation.set(result, ttl, TimeUnit.MINUTES);
        } else {
            log.info("process result don't need to be cached");
            redisTemplate.delete(keyOperation.getKey());
        }
    }

    private boolean needCache(ContentCachingResponseWrapper responseCopier) {
        int statusCode = responseCopier.getStatus();
        return statusCode >= 200
                && statusCode < 300;
    }

}
```

Dive into the logic here, after the original business logic, we will get a response.  
In certain scenarios, such as network errors or temporary failures, it becomes necessary to permit the client to retry
our API. To achieve this, the needCache method is introduced.
It ensures that we only cache the response body when the HTTP status is in the 2xx range. If caching is unnecessary, we
also take the step of deleting the in-progress cache record in Redis.
This prevents all subsequent retry calls from consistently encountering an in-progress error.

In the case of caching the response, we would need to cache all the needed headers (omitted for simplicity in this instance), the status code, and configure a Time-to-Live (TTL) setting. The TTL is crucial to ensure the periodic cleanup of Redis, maintaining a tidy and efficient storage environment.

### How to properly respond when cache exists

In this scenario, it is imperative to abstain from executing the original business logic. Instead, when a prior request is still in progress, the appropriate course is to return an in-progress error. Conversely, if the previous request has successfully finished and a cached response is available, it should be rapidly returned. For both cases, we need
to build the response in the `IdempotenceFilter`.

```java

@Slf4j
@RequiredArgsConstructor
public class IdempotenceFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        // define variables

        if (isNotTargetMethod(method)) {
            // invalid http method
        } else if (StringUtils.isBlank(requestId)
                || StringUtils.isBlank(clientId)) {
            // invalid header
        } else {
            log.info("requestId and clientId not empty, rid = {}, cid = {}", requestId, clientId);
            BoundValueOperations<String, IdempotencyValue> keyOperation = redisTemplate.boundValueOps(cacheKey);
            boolean isAbsent = keyOperation.setIfAbsent(IdempotencyValue.init(), ttl, TimeUnit.MINUTES);
            if (isAbsent) {
                // if cache is not exist
            } else {
                log.info("cache {} already exist ", cacheKey);
                handleWhenCacheExist(request, response, keyOperation);
            }
        }
    }

    private void handleWhenCacheExist(HttpServletRequest request, HttpServletResponse response,
                                      BoundValueOperations<String, IdempotencyValue> keyOperation)
            throws IOException {
        IdempotencyValue cachedResponse = keyOperation.get();
        log.info("cached content = {} ", cachedResponse);
        String responseBody;
        Integer status;

        if (cachedResponse.isDone) {
            log.info("cache {} exist, and is done.");
            status = cachedResponse.status;
            responseBody = cachedResponse.cacheValue;
        } else {
            log.info("cache exist, and is still in processing, please retry later");
            status = TOO_EARLY.value();
            ProblemDetail pd = ProblemDetail.forStatus(TOO_EARLY);
            pd.setType(URI.create(request.getRequestURI()));
            pd.setDetail("request is now processing, please try again later");
            responseBody = OBJECT_MAPPER.writeValueAsString(pd);
        }
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);

        PrintWriter responseWriter = response.getWriter();
        responseWriter.write(responseBody);

        response.flushBuffer();

    }
}
```

The key to doing this is to write something into the response writer, and then do `flushBuffer()`. In this way, we can
deal with both the in-progress error response and the cached successful response.

Combine all the snippets above we get a comprehensive mechanism in IdempotenceFilter (please get the complete code in
my [GitHub Repository](https://github.com/NoahHsu/event-sourcing-order-poc/blob/9bea0389c41396058bd6b61fa3016306dbc1aeab/modules/idempotency/src/main/java/org/example/event/sourcing/order/poc/modules/idempotency/filter/IdempotenceFilter.java#L31))

## Modify original service logic
Within the original service (OrderService), our primary concern is to verify, through a database check, whether the request has been previously executed. This step is crucial due to the existence of a TTL constraint imposed on the idempotency cache, a measure taken to optimize performance.

In my project, I've implemented this check as follows (with the request body's ID serving as the unique identifier for the same request within the context of my business logic):

```java
public class OrderService {

    public Order createOrder(Order order) {
        Optional<V1Order> queryResult = queryOrder(order.id());
        if (queryResult.isPresent()) {
            return toOrder(queryResult);
        } else {
            boolean isSuccess = orderEventProducer.create(new OrderEvent(order.id(), CREATED, Instant.now()));
            if (isSuccess) {
                return order;
            } else {
                log.warn("create Order event fail", order);
                throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "send event fail.");
            }
        }
    }
}
```

## Demonstrate the result

Finally, we complete the whole idempotency mechanism, let see how would it work.

I prepare four command-line terminal, three of them would send exactly the same request to server (especially the
same `rid` and `cid`), Meanwhile, the fourth terminal utilizes rdcli to inspect the cache values in Redis.

- **Left-Top**: The first one to send the request.
- **Right-Top**: Send request after the left-top send, but before it receive response.
- **Left-Bottom**: Send request after the left-top receive response.
- **Right-Bottom**: Query the key-value during these process.

![idempotency_demo.gif](resources%2Fidempotency-api%2Fidempotency_demo.gif)

We can see that, during the Left-Top request is processing, the request in Right-Top quickly get a `425 Too Early`
response, and the cache in redis is marked as `isDone:false`.
Then, after the response of the Left-Top terminal is back, the cache in redis will be marked as `isDone:true` and with a
response body `{\"id\":\"22222\"}`.

Finally, sending the request again in the Left-Bottom terminal quickly yields the same response as the Left-Top, indicating the successful implementation of the idempotency mechanism.
## Summary

In this article, we delve into the implementation of the idempotency mechanism proposed in my earlier article, [how-to-design-an-efficient-idempotency-api](https://medium.com/gitconnected/how-to-design-an-efficient-idempotency-api-e664fa2954bb)
within a Spring Boot 3 Application.

Our approach leverages Spring's autoconfiguration feature, transforming it into a plug-and-use module. Specifically, we make use of various Spring Boot components to streamline development, avoiding the reinvention of the wheel. Notable components include `ContentCachingResponseWrapper` for reading response bodies multiple times, `BoundValueOperations.setIfAbsent` to prevent race conditions, and the utilization of `ProblemDetail` and `HttpServletResponse Writer` to ensure proper responses to clients. Additionally, a simple command-line demonstration showcases how the mechanism operates in practice.

For those interested in exploring the complete code changes, please refer to the associated [Pull Request](https://github.com/NoahHsu/event-sourcing-order-poc/pull/67). Any feedback is greatly appreciated, and a minor fix is also addressed in the [second Pull Request](https://github.com/NoahHsu/event-sourcing-order-poc/pull/68). Feel free to explore and share your thoughts.

### Reference:

- [https://medium.com/gitconnected/how-to-design-an-efficient-idempotency-api-e664fa2954bb](https://medium.com/gitconnected/how-to-design-an-efficient-idempotency-api-e664fa2954bb)
- [https://docs.spring.io/spring-data/data-redis/docs/3.1.5/reference/html/](https://docs.spring.io/spring-data/data-redis/docs/3.1.5/reference/html/)
- [https://github.com/spring-projects/spring-data-examples/tree/main/redis](https://github.com/spring-projects/spring-data-examples/tree/main/redis)
- [https://www.baeldung.com/spring-mvc-handlerinterceptor](https://www.baeldung.com/spring-mvc-handlerinterceptor)
- [https://stackoverflow.com/questions/26699385/spring-boot-yaml-configuration-for-a-list-of-strings](https://stackoverflow.com/questions/26699385/spring-boot-yaml-configuration-for-a-list-of-strings)
