---
tags:
- DevOps
- Feature Toggle
- Deployment Strategy
---
# Easier, Flexible, and Lower Resource Cost Deployment Strategies by Feature Toggle
![img.png](cover_image.png)
Having different deployment strategies is essential to ensure that the new version of the software is delivered to users in an efficient and robust way. After reading other articles, we can organize the following summary( If you are not familiar with deployment strategies, please see [this](https://www.baeldung.com/ops/deployment-strategies) or [this](https://www.plutora.com/blog/deployment-strategies-6-explained-in-depth) to get a comprehensive explanation):

The easiest **Recreate Deployment** might cause service downtime and expose potential bugs to all users. Others (**Blue/Green, Rolling, A/B Testing, Shadow, Canary**… ) guarantee zero downtime, and some of them use more resources (hardware like memory, CPU…) to achieve running both versions of the applications at the same time to provide more confidence in a release or easier to rollback to the old version.

But we should not treat the hardware resources like they are free or unlimited, especially in this harsh time for the whole software industry. So as [*Pete Hodgson*](https://thepete.net/) says in his article ([Feature Toggle](https://martinfowler.com/articles/feature-toggles.html)), we can use a **feature toggle system to perform the strategy** (i.e. Canary, A/B Testing…) which can **save some resources**. Moreover, we **can eliminate the difficult jobs** (for some developers not familiar with DevOps or SRE knowledge) of setting the continuous delivery tool or network components (i.e. load balancer) for the strategy. The only works remaining are setting toggles and writing some code (easy if/else or switch).

In this article, we will introduce:

1. What features are required for a toggle system to do so?
2. How to use a toggle system to perform different deployment strategies (Blue/Green, A/B Testing, Canary, Shadow… )?
3. How to minimize the toggle maintenance effort?

Here is the GitHub Repository [open-feature-openflagr-example](https://github.com/NoahHsu/open-feature-openflagr-example) for this article, feel free to visit and leave any comments.

--- 

## Requirements of a Feature Toggle System
When considering the adoption of a toggle system instead of complex release strategies, it’s essential to explore different open-source and enterprise-level toggle systems available on the internet([Unleash](https://www.getunleash.io/?utm_source=theproductmanager.com&utm_medium=cpc&utm_campaign=Demand_052023&utm_content=BestFeatureFlags), [Flagsmith](https://flagsmith.com/?utm_source=list&utm_medium=cpc&utm_campaign=productmanagerlist), [Flagr](https://github.com/openflagr/flagr), [LanuchDarkly](https://launchdarkly.com/), etc.) and choose a toggle system with the following features and traits in minimal requirements:

1. **Dynamic Evaluation can afford High RPS calling**: The toggle system should handle high RPS loads efficiently when evaluating toggle states via its API (get toggle is on/off via API) since the toggle should affect the core business performance at a minimal level.
2. **Dynamic Configuration and Persistence**: The toggle system should offer the flexibility to adjust settings dynamically, allowing changes to be made either through a UI or via an API. Furthermore, it should ensure that these configuration changes persist even in a server shutdown, ensuring consistent behavior across system restarts.
3. Toggle evaluation API should provide features:
   - **Targeting Key supported**: Distribution toggle result based on an identifier in request (e.g. a hash algorithm, so that the same ID will always get the same result)
   - **Evaluation Context Supported**: Can set constraints to decide the result (e.g. when the region in request payload = Asia then toggle on; = Europe then toggle off)

The above are the minimal requirements for replacing deployment strategies by integrating our application with a toggle system. We can transfer the traffic configuration work into our development job on the codebase to be reviewed with the feature pull request (PR).

---

## Deployment Strategies with Toggle
In this part, we will show how to **config the toggle** (take Flagr as an example), and demonstrate how would the **code snippet** be like in a simple way ( I will use simple `if/else` or `switch` for the demo, so it can be implemented as a strategy pattern or other elegant way in a real project). Started from the easiest **toggle on/off** to perform **Blue/Green** or **Shadow** deployment. Then apply the percentage-based rollouts setting on the toggle to achieve **Canary Release**. Finally, add constraints to evaluate the context (fields in request payload) to implement **A/B Testing**.

Given this shared code snippet for the following demos:

```java title="service.java"
public static String v1Feature() {
    return BLUE + "o" + RESET;
}

public static String v2Feature() {
    return GREEN + "x" + RESET;
}
```
### Blue/Green (on/off)
The configuration of the toggle is very simple in these two scenarios.

![image](https://github.com/NoahHsu/noahhsu.github.io/assets/58896446/3b3b5ac8-202d-48ee-b8c8-ca80151ed432)
![image](https://github.com/NoahHsu/noahhsu.github.io/assets/58896446/245e2e33-3e1a-4a54-8bf1-b6a064181f48)

and the code is like the below for a **Blue/Green Deployment**:

``` java
...
boolean toggleOn = client.getBooleanValue(FLAG_KEY, false, ctx);

String message;
if (toggleOn) {
    message = v2Feature();
    v2++;
} else {
    message = v1Feature();
    v1++;
}
System.out.print(message);
...
```

I set the toggle off at first and then turned it on during the iteration execution. We can see that the app switches between the two features smoothly exactly as we expected.

![image](https://github.com/NoahHsu/noahhsu.github.io/assets/58896446/f9361529-a806-4f2e-93fa-1d77463a1035)

In this way, we can **save a lot of hardware resources since we don’t need complete two (blue and green) distinguish environments** to run the different versions of apps.

### Shadow Release (on/off)
in this example, we can share the same flag config with the blue/green deployment but set the toggle on in the first place. The code is like the below for a **Shadow Deployment**:
``` java
...
String version = client.getStringValue(FLAG_KEY, "off", ctx);

String message = "";
message = v1Feature();
v1++;
if (version.equalsIgnoreCase("on")) {
    Thread newThread = new Thread(() -> {
        atomicString.accumulateAndGet(v2Feature(), String::concat);
        v2.getAndIncrement();
    });
    newThread.start();
}
System.out.print(message);

```
at first, we call both the v1 and the v2 features, suppose we find something went wrong in the v2 feature then we turn off the toggle during the iteration. Then we can see that the v2 is no longer been called.

![image](https://github.com/NoahHsu/noahhsu.github.io/assets/58896446/35b9a136-ab08-4dd1-bb9d-fcffb02cef0b)

Using a toggle system to perform Shadow Release is a **highly flexible and efficient way**. As long as we put some more complexity into code and put a little bit of effort into asynchronous.

### Canary Release (percentage-based rollouts)
Let’s introduce the distribution feature into the toggle’s configuration for Canary Release.

![image](https://github.com/NoahHsu/noahhsu.github.io/assets/58896446/31307ae6-a56f-44b6-be2e-7d9479047208)
![image](https://github.com/NoahHsu/noahhsu.github.io/assets/58896446/90b18b14-9484-4aff-8c03-70561faeebfe)

and the code is like the below for a Canary Release:

``` java
...
UUID userId = UUID.randomUUID();
MutableContext ctx = new MutableContext(userId.toString());

String version = client.getStringValue(FLAG_KEY, "v1", ctx);

String message = "";
switch (version) {
    case "v1" -> {
        message = v1Feature();
        v1++;
    }
    case "v2" -> {
        message = v2Feature();
        v2++;
    }
}
System.out.print(message);
...
```

Given the distribution is like 3:1 (v1=75%; v2=25%), and since we gave different `targetKey` to every request, we will get a result that is very close to the given distribution.
![image](https://github.com/NoahHsu/noahhsu.github.io/assets/58896446/0d0f94f4-d358-45f0-8c7d-b05fa2d4355a)
what if we gave the same `targetKey` as `"tester"`,

![image](https://github.com/NoahHsu/noahhsu.github.io/assets/58896446/98aa9567-eced-4f76-89da-c9b20c2c10ca)

The result will stay the same since the same `targetKey` is hashed to the same result (in this example, v2).

So we can say that using a toggle system for canary release is quite easy and straightforward. we can change the percentage any time we like, as long as we think the new feature is steady enough to move on next level.

### A/B Testing (constraints on context)
Finally, let’s implement A/B testing. We could add the final piece of a toggle system, constraints on the context like below.

![image](https://github.com/NoahHsu/noahhsu.github.io/assets/58896446/112ee9ee-e09b-4b07-8425-7945655e210f)
![image](https://github.com/NoahHsu/noahhsu.github.io/assets/58896446/57dacd5a-8128-4642-a55e-a96f9dbdf6a7)
![image](https://github.com/NoahHsu/noahhsu.github.io/assets/58896446/7d49ad99-2b49-4b02-a483-d7ca8ccf0914)
![image](https://github.com/NoahHsu/noahhsu.github.io/assets/58896446/d9cb5ba3-1c9e-4ee2-8e05-d8acdbb580e2)
and the code is like below for A/B Testing:

``` java
...
UUID userId = UUID.randomUUID();
MutableContext ctx = new MutableContext(userId.toString());
ctx.add("region", region);

String version = client.getStringValue(FLAG_KEY, "v1", ctx);

String message = "";
switch (version) {
    case "v1" -> {
        message = v1Feature();
        v1++;
    }
    case "v2" -> {
        message = v2Feature();
        v2++;
    }
}
System.out.print(message);
...
```
Given the constraint that all users from Asia should use the v1 feature while users from Europe use the v2, and users from other regions should use the feature like a fifty-fifty distribution. As we can see in the report, the distribution is as our expectation.

![image](https://github.com/NoahHsu/noahhsu.github.io/assets/58896446/2aae04d7-5d23-4c12-ab8c-8bb3a9a07347)

Since we can adjust the constraint dynamically, it makes it **extremely flexible and easy to control** the feature experiment, pilot feature in a production environment, etc.

---

## Minimize Toggle Maintainance Effort

As the development cycle progresses, the toggle-related snippet will spread all over the codebase, or even worse, across multiple repositories. Then, the code will look like a mess, and developers will easily get lost in toggle logic and core business logic.
Furthermore, we might also find that the chosen toggle system didn’t meet our expectations or raised security concerns, leading to the need for transfer to a different toggle system.

To address these complexities, it becomes imperative to introduce an additional layer of abstraction toggle logic to help the app perform toggle evaluation elegantly. Thus, the [OpenFeature specification](https://openfeature.dev/docs/reference/intro/) is born.

We won’t cover too much about OpenFeature, but here is the basic key concept that we should know:

### Implementation Client:
- Develop an XxxClient (i.e. flagrClient), or use the SDK provided by the toggle system to be an API Client to send requests to the toggle system.

  ``` java
  public interface OpenFlagrClient {

    String BASE_PATH = "/api/v1/";

    @RequestLine("POST " + BASE_PATH + "evaluation")
    @Headers("Content-Type: application/json")
    V1EvaluationResponse evaluate(V1EvaluationRequest request);

  }
  ```
- Develop an [XxxFeatureProvider](https://github.com/open-feature/java-sdk/blob/d5a9867365d62bda51b87ff1d13e4f4daaee87cd/src/main/java/dev/openfeature/sdk/FeatureProvider.java#L11), which lists all the common (or maybe the more reasonable) use cases for a real-time toggle evaluation logic.

  ``` java
  public class OpenFlagrProvider implements FeatureProvider {
  ...
    public ProviderEvaluation<Boolean> getBooleanEvaluation(String key, 
             Boolean defaultValue, EvaluationContext ctx) {

        V1EvaluationRequest request = buildRequest(key, ctx);

        V1EvaluationResponse response = flagrClient.evaluate(request);
        String answerVariant = response.variantKey() == null
                ? ""
                : response.variantKey().toLowerCase();
        boolean isOn = defaultOnToggleKeys.contains(answerVariant);

        return ProviderEvaluation.<Boolean>builder()
                .value(isOn)
                .variant(response.variantKey())
                .build();
    }

    @Override
    public ProviderEvaluation<String> getStringEvaluation(String key, 
             String defaultValue, EvaluationContext ctx) {
        V1EvaluationRequest request = buildRequest(key, ctx);
        V1EvaluationResponse response = flagrClient.evaluate(request);
        String answerVariant = response.variantKey() == null
                ? ""
                : response.variantKey();

        return ProviderEvaluation.<String>builder()
                .value(answerVariant)
                .build();
    }
  ... there are a lot of other methods

  }
  ```
### Configuration Client and OpenFeature
Then, configure the XxxFeatureProvider to the [OpenFeatureAPI](https://github.com/open-feature/java-sdk/blob/d5a9867365d62bda51b87ff1d13e4f4daaee87cd/src/main/java/dev/openfeature/sdk/OpenFeatureAPI.java) instance, which is designed to have multiple different FeatureProvider (can set/get with name). Here, since I am working on a spring boot, I build a class to contain the OpenFeatureAPI instance.

``` java
public class FeatureToggleApiProvider implements InitializingBean {
    @Autowired
    FlagrClient flagrClient;

    OpenFeatureAPI api = OpenFeatureAPI.getInstance();

    @Override
    public void afterPropertiesSet() throws Exception {
        OpenFlagrProvider openFlagrProvider = new OpenFlagrProvider(flagrClient);
        api.setProvider(openFlagrProvider);
    }

    public Client getFlagrApiClient() {
        return api.getClient();
    }

}
```
### Make Use of OpenFeature

Finally, other modules can make use of this `OpenFlagrProvider` to perform toggle evaluation by getting a [Client](https://github.com/open-feature/java-sdk/blob/d5a9867365d62bda51b87ff1d13e4f4daaee87cd/src/main/java/dev/openfeature/sdk/Client.java) interface ( not implemented by the XxxClient, but is by [OpenFeatureClient](https://github.com/open-feature/java-sdk/blob/d5a9867365d62bda51b87ff1d13e4f4daaee87cd/src/main/java/dev/openfeature/sdk/OpenFeatureClient.java) which will make use of the given [XxxFeatureProvider](https://github.com/open-feature/java-sdk/blob/d5a9867365d62bda51b87ff1d13e4f4daaee87cd/src/main/java/dev/openfeature/sdk/FeatureProvider.java#L11)):

``` java
Client client = featureToggleApiProvider.getFlagrApiClient();

String version = client.getStringValue(FLAG_KEY, "v1", ctx);
// or 
boolean toggleOn = client.getBooleanValue(FLAG_KEY, false, ctx);
```

### What's the Benefits?
Here is a rough introduction of how to integrate a toggle system via OpenFeature specification (please check my [GitHub Repo](https://github.com/NoahHsu/open-feature-openflagr-example/tree/main/client/src/main/java/org/example/open/feature/openflagr/client) for more details and complete code). The toggle logic is extracted into another abstract layer and the **main application remains focused on core business and deployment strategies**. Even one day we need to change the toggle system, the application won’t need any change, since we only need to develop the new XxxClient and XxxFeatureProvider (maybe there is an existing one so no development work is needed, check out the [OpenFeature Ecosystem](https://openfeature.dev/ecosystem)).

---

## Summary
In this article, we go through three points that we should know when we want to perform the **deployment strategies in a more flexible, easier, and lower-cost way** with a feature toggle. First, our toggle system should be capable of **dynamic configuration with persistence**, provide a **high-efficiency dynamic evaluation method**, and the evaluation should s**upport targeting-key and constraint on request context** (payload). Then, we show the toggle configuration and code snippet for different kinds of deployment strategies. Finally, we introduce the **OpenFeature abstraction layer** to make the codebase stay clean and be more maintainable and flexible.

### Reference
Deployment strategies and toggle knowledge

- [https://www.baeldung.com/ops/deployment-strategies](https://www.baeldung.com/ops/deployment-strategies)
- [https://www.plutora.com/blog/deployment-strategies-6-explained-in-depth](https://www.plutora.com/blog/deployment-strategies-6-explained-in-depth)
- [https://martinfowler.com/articles/feature-toggles.html](https://martinfowler.com/articles/feature-toggles.html)
- [https://en.wikipedia.org/wiki/Service_provider_interface](https://en.wikipedia.org/wiki/Service_provider_interface)