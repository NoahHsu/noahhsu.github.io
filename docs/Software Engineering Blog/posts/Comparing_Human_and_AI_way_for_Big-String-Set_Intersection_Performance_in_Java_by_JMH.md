---
date:
  created: 2024-11-07
authors:
  - NoahHsu
categories:
  - Coding
tags:
  - Java
  - Performance
  - Set
---
# Comparing Human and AI way for Big-String-Set Intersection Performance in Java by JMH

![cover.png](resources/BigSetIntersec/cover.png)

Recently, I'm facing a case on my job, comparing two set of users and find the intersection as the result. But the difficult part is the number of set is quite big (both sets could be 10,000+ elements). To provide a better experiment for our users, the speed can not be too slow. So I want to find a relatively quick way to do the intersection work. 

In this article, I use AI (Gemini, ChatGPT) and the 'old-school' way, Stackoverflow to find several ways to do the set intersection. And Use the JMH [Java Microbenchmark Harness](https://github.com/openjdk/jmh) to run all the test and produce report.

<!-- more -->

## Candidate Intersection Methods

### Gemini way

First candidate is the Gemini 

![gemini.png](resources/BigSetIntersec/gemini.png)

Gemini provides a way to loop on the bigger set (create a new `HashSet`), and use the `smallSet.contains()` as an if-condition to decide whether to collect the element as the result.

we now call it the `loopBigSetIsContainedByNewSmallSet`.

### Gemini way (human modified)

But The Gemini way, create a new HashMap at the first line. it seems a redundant behavior, so we provide a refined way to not create the new HashSet and call it the `loopBigSetIsContainedBySmallSet`.

### ChatGPT way

The second competitor is ChatGPT (GPT4o).

![chatGPT.png](resources/BigSetIntersec/chatGPT.png)

ChatGPT writes a straightforward function that uses a native Java method `Set.retainAll` to do the trick. we call it the `smallSetRetainAllBigSet`.

---

After the AI handouts their solution, let's try the old-school way to find some answers. Here I found the [question](https://stackoverflow.com/questions/2851938/efficiently-finding-the-intersection-of-a-variable-number-of-sets-of-strings) had been asked 3 years before, In this question, the accepted answer is also using the `Set.retainAll`. but we still get two more ways from other answers. Let's take a look.

### Stackoverflow way1: stream.filter

The first human-provided answer is to use the Java 8 feature to open a stream() on the small set, and check if each element is contained by the big set 

![stream.png](resources/BigSetIntersec/stream.png)

So we called this the `streamSmallSetIsContainedByBigSet` and another version as `streamSmallSetIsContainedByNewBigSet` to compare with the Gemini way.

### Stackoverflow way2: guava

The final way is to use the Google-provided utils library, [Guava](https://github.com/google/guava). There is a method `intersection()` in the utils-class `Sets`. 

![guava.png](resources/BigSetIntersec/guava.png)

## How to test: JMH

We all know that the JVM needs some time (code execution) to warm up for steady performance on methods. Besides, we also need to do performance calculations and produce easy-to-read results. It sounds troublesome. But luckily, we have Java Microbenchmark Harness (JMH) to do that for us.

### how to use

There are lots of guidance or How-To articles online to do that. I follow the README in [jmh-gradle-plugin](https://github.com/melix/jmh-gradle-plugin) and everything goes well. If you are interested in the details or code implementation, please refer to [my repository](https://github.com/NoahHsu/performance-benchmark/tree/main/src/jmh/java/org/example/bigset/intersacation), there is a working example.

### scenario description

In my use case, I need to extract user IDs that are present in both of two sets: one representing users who have previously purchased my product, and the other representing users who have agreed to receive advertisements.

To evaluate performance, I designed two scenarios:

1. Both sets contain 100,000 UUIDs, with 1,000 IDs as the intersection.
2. One set contains 100,000 UUIDs, while the other contains 1,100 UUIDs, including the same 1,000 IDs as the intersection. 

## Comparing Result

Here, we can start to execute the JMH command with the [jmh-gradle-plugin](https://github.com/melix/jmh-gradle-plugin). However, there are some essential points that we should be cautious about.

### Be Careful of The Lazy Loading Value

Some of the methods in Java follow the lazy loading way (e.g. guava's `Sets.intersection()` only returns a `SetView` instance until calling some method of that SetView). These kinds of methods will be executed extremely quick. while other methods need to take between 0.045 ms ~ 0.085 ms, the lazy loading way costs only around 0.00001 ms.

![lazyloading.png](resources/BigSetIntersec/lazyloading.png)

So we need to add some common method call after it. For example, adding a value assignment from the intersection set helps to trigger the SetView to truly execute the intersection, and we finally get the correct result.

```java
    public static <T> Set<T> getIntersection(Set<T> set1, Set<T> set2) {
        Set<T> answer;
        if (set1.size() <= set2.size()) {
            answer =  Sets.intersection(set1, set2);
        } else {
            answer = Sets.intersection(set2, set1);
        }

        int size = answer.size();

        return answer;
    }
```

### JVM Warm-Up Matters

Next, we take a look at how JVM warm-up affects the stability of the result. If only run 1 warm-up iteration, we will get high errors, which means the result is not stable.
![1Warnup.png](resources/BigSetIntersec/1Warmup.png)

For comparison, if we warm up for 3 iterations, we can get a more stable result with a lower error.

![3Warmup.png](resources/BigSetIntersec/3Warmup.png)

## Summary

Check on the final result, the AI-generated method is working, but may not be the best solution. We still have some chances to optimize and modify the given answer. Especially for the coding details like the creation of new instances actually make the time cost twice. So if we can ensure the parameters will be `HashSet` or do it only when they aren't. The performance can be improved. 

Besides, when using JMH, we should always be cautious about the JVM warm-up and whether the method returns a lazy loading value. Both factors will affect the correctness and deviation of our results.

Finally, in this AI v.s. human combat, the final winner is still human. In both my scenarios, the Google's guava library `Sets.intersection()` outperform the others, takes less than half of the original AI-generated methods. 

### Reference

- https://github.com/melix/jmh-gradle-plugin
- https://stackoverflow.com/questions/2851938/efficiently-finding-the-intersection-of-a-variable-number-of-sets-of-strings
- https://gemini.google.com/app
- https://chatgpt.com/