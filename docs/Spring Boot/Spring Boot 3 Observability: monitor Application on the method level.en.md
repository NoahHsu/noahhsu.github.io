---
tags:
- Spring Boot
- DevOps
- Observability
- Java
---
# Spring Boot 3 Observability: monitor Application on the method level

###### Observe using ObservedAspect with logging method arguments

![cover.png](resources%2Fspring-observability%2Fcover.png)

Observability is one of the significant improvements in the Spring Boot 3 (also see [how I migrate to spring boot 3](https://noahhsu.medium.com/what-problems-did-i-solve-when-migrating-spring-boot-to-3-0-0-796b545ec00)), they now provide an effortless, pluggable way to use annotation to observe all the logs, trace, and metrics data for our spring beans.

In this article, we will go through below topics:

- Recap on how observability works
- Run monitoring component (Grafana, Loki, Tempo, Prometheus) by docker-compose
- How to implement code to observe the Application
- How to log method arguments in ObservedAspect
- How would data be displayed on the Grafana

This Article is based on the [guide](https://spring.io/blog/2022/10/12/observability-with-spring-boot-3) posted in the [Spring Blog](https://spring.io/blog), adding some of my opinion and how I solve some topics that were not covered in the original post. Please refer to the code change on my [GitHub project PR](https://github.com/NoahHsu/event-sourcing-order-poc/pull/43). Let’s begin!

---

## Recap on how observability works

First, let’s do a quick recap on observability. We have four components in a normal architecture:

1. Log aggregation system <br>
   e.g. **Loki**, Fluentd, Logstash… ([reference](https://www.tek-tools.com/apm/best-log-aggregator-tools)).
2. Distributed tracing backend <br>
   e.g. **Tempo**, Jaeger, Zipkin… ([reference](https://signoz.io/blog/distributed-tracing-tools/)).
3. Time series metrics and monitoring system/database <br>
   **Prometheus** is kind of dominant, but there are still some [alternatives](https://prometheus.io/docs/introduction/comparison/).
4. Data query, visualize, alerting platform <br>
   e.g. **Grafana**, kibana... (see more [alternatives](https://uptrace.dev/blog/grafana-alternatives.html))

And the whole architected processed like below:

1. Applications keep producing logs while running 
2. Logs are sent to or pulled from the Log aggregation system 
3. Data of trace and span are sent to the Distributed tracing backend 
4. Prometheus will scrape metrics from Applications periodically. (In some cases we can also push metrics to Prometheus. [how to](https://prometheus.io/docs/instrumenting/pushing/))
5. Grafan provides a GUI for us to easily access data in others components. Then display data in a dashboard, check alerting rule is matched, and respond to our exploring query, etc.

---

## Run monitoring components by docker-compose

I basically follow the `docker-compose.yml` mentioned in this [post](https://spring.io/blog/2022/10/12/observability-with-spring-boot-3). And then add the dependency config files under this [folder](https://github.com/marcingrzejszczak/observability-boot-blog-post/tree/main/docker). Some notable things are:

- We can see the Prometheus scrape metrics form itself with the default metrics path, `/metrics` like below (see more in the [official config document](https://prometheus.io/docs/prometheus/latest/configuration/configuration/)). This is because we can also monitor the status of Prometheus servers.

```yaml title="prometheus/prometheus.yml"
scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets:
        - 'localhost:9090'
```

- We have to change the scrape setting for our application. Since we have set `extra_hosts: [‘host.docker.internal:host-gateway’]` in the `docker-compose.yml` , The Prometheus use `host.docker.internal` to access the application either run on localhost or docker (need to expose port).

```yaml title="prometheus/prometheus.yml"
scrape_configs:
  ...
  - job_name: 'cluster-api'
  metrics_path: '/actuator/prometheus'
  static_configs:
    - targets: [ 'host.docker.internal:8081' ]
      labels:
        namespace: 'event-sourcing'
        app: 'order-command'
```

- We can download many dashboard template JSON files from [Grafana Labs](https://grafana.com/grafana/dashboards/?search=spring+boot). Then put it in the folder that will be mounted in Prometheus by setting volume in `docker-compose.yml`. This is because we set the following to provide dashboards to Grafana.

```yaml title="grafana/provisioning/dashboards/dashboard.yml"
providers:
  - name: dashboards
    type: file
    disableDeletion: true
    editable: true
    options:
      path: /etc/grafana/provisioning/dashboards
      foldersFromFilesStructure: true
```

After preparing all the config files, we can finally use docker-compose to start all the components (Grafana, Loki, Tempo, Prometheus):
``` shell
docker compose -f observe-docker-compose.yaml -p observability up
```

Then we can see them running well in the docker dashboard (see [my commit](https://github.com/NoahHsu/event-sourcing-order-poc/pull/43/commits/4822008c1071b367d13b76b9cbc51b195067a4f0) for all the files in detail).

![docker.png](resources%2Fspring-observability%2Fdocker.png)

---

## How to implement code to observe the Application
Next, we are going to make our application expose metrics and send out traceable logs.

### Dependencies and Configs
First, add the following dependency:

``` groovy title="build.gradle"
dependencies {
 // using new @Observed on class and enaabled @ObservedAspect
 implementation "org.springframework.boot:spring-boot-starter-aop"
 // enabled endpoint and expose metrics
 implementation "org.springframework.boot:spring-boot-starter-actuator"
 implementation "io.micrometer:micrometer-registry-prometheus"
 // handleing lifecycle of a span
 implementation "io.micrometer:micrometer-tracing-bridge-brave"
 // send span and trace data 
 // endpoint is default to "http://locahost:9411/api/v2/spans" by actuator
 // we could setting by management.zipkin.tracing.endpoint 
 implementation "io.zipkin.reporter2:zipkin-reporter-brave"
 // send logs by log Appender through URL
 implementation "com.github.loki4j:loki-logback-appender:1.4.0-rc2"
 }
```

Second, add an `application.yaml` in the project resources to set up the related properties:

```yaml title="application.yaml"
management:
  tracing:
    sampling:
      probability: 1.0 # sampling all in dev, reduce it in prod to save loading
  endpoints:
    web:
      exposure:
        include: prometheus
  metrics:
    distribution:
      percentiles-histogram:
        http:
          server:
            requests: true

logging:
  pattern:
    level: "%5p [${spring.application.name:},%X{traceId:-},%X{spanId:-}]"
```

Third, setting the log appender to auto-send logs to the Loki server.

``` xml title="logback.xml 
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
    <include resource="org/springframework/boot/logging/logback/base.xml" />
    <springProperty scope="context" name="appName" source="spring.application.name"/>

    <appender name="LOKI" class="com.github.loki4j.logback.Loki4jAppender">
        <http>
            <url>http://${LOKI_HOST:-localhost}:3100/loki/api/v1/push</url>
        </http>
        <format>
            <label>
                <pattern>app=${appName},host=${HOSTNAME},traceID=%X{traceId:-NONE},level=%level</pattern>
            </label>
            <message>
                <pattern>${FILE_LOG_PATTERN}</pattern>
            </message>
            <sortByTime>true</sortByTime>
        </format>
    </appender>

    <root level="INFO">
        <appender-ref ref="LOKI"/>
    </root>
    <logger name="feign" level="DEBUG"/> <!-- you can set your own level rule -->
</configuration>
```

### Code Implementation
First, add a configuration to enable spring scan for the annotation `@Observed` , which will make the class/method also handled by the related class of Zipkin and Prometheus to send trace data or prepare metrics data.

```java title="ObserveConfiguration.java"
import io.micrometer.observation.ObservationRegistry;
import io.micrometer.observation.aop.ObservedAspect;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
public class ObserveConfiguration {

    @Bean
    ObservedAspect observedAspect(ObservationRegistry observationRegistry) {
        return new ObservedAspect(observationRegistry);
    }

}
```

Then, we need to add `@Observedon` the classes/methods, which we consider as a new span start. Also, we can add some logs in the method so that it can be found by Loki, not only the trace and span data in Tempo. Besides, the class didn’t annotate with `@Observed`, The logs produced by them will also have the `traceId` and `spanId` as we defined in the log pattern but stay in the same span.

``` java title="OrderV2Controller.java"
import io.micrometer.observation.annotation.Observed;
...

@RestController
@RequiredArgsConstructor
@RequestMapping(value = "api/v2/orders")
@Slf4j
@Observed
public class OrderV2Controller {

    private final OrderService orderService;

    @PostMapping
    @ResponseStatus(HttpStatus.OK)
    public Order createOrder(@RequestBody Order order) {
        log.info("recieve create order command, order = {}.", order);
        return orderService.createOrder(order);
    }

}
```

Basically, observability is enough for application with the above setting and implementation. But I encounter some issues:

- The self-config `OpenFeignClient` (not auto-configure by `spring-cloud-starter-feign`) won’t send the `traceId` with the request to the target server, so the trace will be lost. ([Solved](https://docs.spring.io/spring-cloud-openfeign/docs/4.0.1/reference/html/#spring-cloud-feign-overriding-defaults))
- The asynchronous methods (i.e. CompletableFuture) don’t have both the `traceId` & `spanId`. (Didn’t solve)

The solution for OpenFeignClient is very easy, we only need to add two Capability while constructing the client instance like:

```java title="OrderCommandClientConfig.java"
import feign.Feign;
import feign.micrometer.MicrometerCapability;
import feign.micrometer.MicrometerObservationCapability;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.observation.ObservationRegistry;
import io.micrometer.observation.annotation.Observed;
...

@Configuration(proxyBeanMethods = false)
public class OrderCommandClientConfig {

    @Bean
    @Observed
    public OrderCommandClient orderCommandClient(ObservationRegistry observationRegistry,
                                                 MeterRegistry meterRegistry) {
        return Feign.builder()
                .logLevel(Logger.Level.FULL)
                .logger(new Slf4jLogger())
                .encoder(new JacksonEncoder())
                .decoder(new JacksonDecoder())
                // let the ObservationRegistry and MeterRegistry autowired 
                // by the Bean constructor, and use in these two Capability
                .addCapability(new MicrometerObservationCapability(observationRegistry))
                .addCapability(new MicrometerCapability(meterRegistry))
                .target(OrderCommandClient.class, "http://localhost:8081");
    }

}
```

For the second issue, I still thinking about whether it is a good idea to put an asynchronous method in the same trace or span of the original request, let's talk about it in the future and ignore it now.

---

## How to log method arguments in `ObservedAspect`
In the previous section, we need to add codes manually into each method for logging. It doesn’t sound right for any software developer. Although the post in Spring Blog does this by implementing the `ObservationHandler<Observation.Context>`, in this way, we can not get arguments of the method in our observation. Then I find this paragraph in the source code:

> According to the javadoc of `ObservedAspect.java` from `io.micrometer-micrometer.observation-1.10.2`:
…You might want to add io.micrometer.common.KeyValues programmatically to the Observation. In this case, the ObservationConvention can help. **It receives an ObservedAspect.ObservedAspectContext that also contains the ProceedingJoinPoint** and returns the `io.micrometer.common.KeyValues` that will be attached to the Observation.

So I wrote this implementation class to log around the observed method with arguments:

```java title="AbstractObserveAroundMethodHandler.java"
import io.micrometer.observation.Observation;
import io.micrometer.observation.ObservationHandler;
import io.micrometer.observation.aop.ObservedAspect;
import org.aspectj.lang.ProceedingJoinPoint;

public class AbstractObserveAroundMethodHandler extends AbstractLogAspect
        implements ObservationHandler<ObservedAspect.ObservedAspectContext> {

    @Override
    public void onStart(ObservedAspect.ObservedAspectContext context) {
        /* we can get many information (including class, arguments...) 
        form ProceedingJoinPoint. */
        ProceedingJoinPoint joinPoint = context.getProceedingJoinPoint();
        super.logBefore(joinPoint);
    }

    @Override
    public void onStop(ObservedAspect.ObservedAspectContext context) {
        ProceedingJoinPoint joinPoint = context.getProceedingJoinPoint();
        super.logAfter(joinPoint);
    }

    @Override
    public boolean supportsContext(Observation.Context context) {
        /* required, otherwise the here will handle the 
        non-spring bean method (e.g. handling http.server.requests) 
        and throw a class cast exception. */
        return context instanceof ObservedAspect.ObservedAspectContext;
    }
}
```

The extended class `AbstractLogAspect` is for the classes that I didn’t put the `@Observed` on it, but still want to log around them. So I extract the logic for others `@Aspect` to use.

```java title="AbstractLogAspect.java"
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.Signature;
...

public class AbstractLogAspect {

    public void logBefore(ProceedingJoinPoint joinPoint) {
        LogInfo logInfo = getLogInfo(joinPoint);
        // this make the logger print the right classType
        Logger log = LoggerFactory.getLogger(logInfo.declaringType);
        log.info("[{}.{}] start ({})", logInfo.className, 
                  logInfo.annotatedMethodName, logInfo.args);
    }

    private static LogInfo getLogInfo(ProceedingJoinPoint joinPoint) {
        Signature signature = joinPoint.getSignature();
        Class declaringType = signature.getDeclaringType();
        String className = declaringType.getSimpleName();
        String annotatedMethodName = signature.getName();
        Object[] args = joinPoint.getArgs();
        return new LogInfo(declaringType, className, annotatedMethodName, args);
    }

    public void logAfter(ProceedingJoinPoint joinPoint) {
        LogInfo logInfo = getLogInfo(joinPoint);
        Logger log = LoggerFactory.getLogger(logInfo.declaringType);
        log.info("[{}.{}] end", logInfo.className, logInfo.annotatedMethodName);
    }

    private record LogInfo(
            @NotNull
            Class declaringType,
            @NotNull
            String className,
            @NotNull
            String annotatedMethodName,
            @Nullable
            Object[] args) {
    }

}
```

Please see more detail on my [Pull Request](https://github.com/NoahHsu/event-sourcing-order-poc/pull/43) in my POC project.

---

## How would data be displayed on the Grafana

After all the settings and implementation above, we can finally look at the result through Grafana UI on http://localhost:3000. First, we can use explore tab to query the logs we are interested in (see how to query by [LogQL](https://grafana.com/docs/loki/latest/logql/)).

![loki.png](resources%2Fspring-observability%2Floki.png)


Now we can see all the logs match our query between different servers. Then we can click one of them and the detailed information will appear. Click the **Tempo** button right next to the `traceId`, the correlated trace and span data will be displayed in a new panel.

![tempo.png](resources%2Fspring-observability%2Ftempo.png)

The data in Tempo is very useful when we want to find out the bottleneck of requests in our micro-service cluster. Now we can get more insight from tempo since the spring boot 3 observability can easily show the time cost for each method in one application.

After exploring, we can save the queries to form a dashboard, or we can download the well-designed dashboard from [Grafana Labs](https://grafana.com/grafana/dashboards/?search=spring+boot). Here I choose one, which very matches our use case.

![grafana.png](resources%2Fspring-observability%2Fgrafana.png)

There are too many things to discuss on Grafana dashboards and alerting rules, so I will just stop here and maybe do some research in the future.

---

## Summary
In this article, we implement the spring boot 3 observability and test locally and run all components (Grafana, Loki, Tempo, and Prometheus) by docker-compose. The spring boot 3 observability provides a very straightforward way to achieve it by AOP and annotation. Moreover, it can now observe detail down to the method level.

Besides, I also do a little study on the source code and find out the easy way to combine the `@Observed` annotation and the spring `aspect` with `ProceedingJoinPoint`, which provides the argument and right class name of the target method. In this way, the log will be more clear and accurate.

There are some useful features I haven’t covered yet, like `lowCardinalityTags`, `highCardinalityTags`, custom metrics, etc. I will keep studying those topics and share them in the future.

### Reference
- [Observability with Spring Boot 3](https://spring.io/blog/2022/10/12/observability-with-spring-boot-3?source=post_page-----8057abec5926--------------------------------)
- [Integration with Micrometer Observation](https://docs.spring.io/spring-boot/docs/current/reference/html/actuator.html?source=post_page-----8057abec5926--------------------------------#actuator.metrics.micrometer-observation)
- [Spring Cloud OpenFeign](https://docs.spring.io/spring-cloud-openfeign/docs/4.0.1/reference/html/?source=post_page-----8057abec5926--------------------------------#spring-cloud-feign-overriding-defaults)
