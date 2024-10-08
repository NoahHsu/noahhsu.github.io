---
date:
  created: 2024-07-12
authors:
  - NoahHsu
categories:
  - Spring Boot
tags:
  - Gradle
  - Java
  - Refactoring
---
# 5 Steps to Make Gradle Configuration Extreme Clean in a Multi-Module Project

![Clean Grade-2.jpg](resources%2FClean%20Grade-2.jpg){width=90%}

Multi-module Gradle projects involve numerous tasks during the build process. Managing dependency version control, plugin usage, build logic, and more with Gradle proves to be a popular and effective approach. But, achieving these tasks requires a lot of configuration scripts, which can make the file more complicated, and more difficult for development. These steps in the article will guide you through a clean and efficient way to manage configuration files:

<!-- more -->

1. extract version declaring in `gradle.properties`.
2. define all plugins and repositories in `settings.gradle`.
3. define all libraries in the `allprojects.dependencyManagement` in `./build.gradle`.
4. declaring dependency and plugin directly instead of using `subproject` in submodule.
5. extract complex and common task config to extra files and apply wherever needed.

Take a look at this [repository](https://github.com/NoahHsu/event-sourcing-order-poc) or [refactor PR](https://github.com/NoahHsu/event-sourcing-order-poc/pull/72), if you can't wait to find out how it looks.

## Step by Step Demonstration

### Step 1: Extract Version Declaration

Version declarations can be extracted into a `gradle.properties` file. Additionally, Gradle arguments can be defined as shown below:

```properties title="./gradle.properties"
group='org.example'
version=0.0.1.SNAPSHOT

# Plugin Version
jibVersion=3.4.3

# Spring Version
springBootVersion=3.1.5
springDependencyVersion=1.1.4
springCloudVersion=2022.0.1

# Dependency Version
springdocVersion=2.1.0
feignMicrometerVersion=12.1
wiremockVersion=3.7.0
logbackAppenderVersion=1.4.0-rc2
lombokVersion=1.18.20

# Gradle Argument
org.gradle.parallel=true
```

### Step 2: Define Used Plugins and Maven Source 

All used plugins and the source Maven repository can be defined in a `settings.gradle`:

```groovy title="./settings.gradle"
import org.gradle.api.initialization.resolve.RepositoriesMode

pluginManagement {
    plugins {
        id 'org.springframework.boot' version "${springBootVersion}"
        id 'io.spring.dependency-management' version "${springDependencyVersion}"
        id 'com.google.cloud.tools.jib' version "${jibVersion}"
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        mavenCentral()
        mavenLocal()
        maven {
            url '.m2/local/'
        }
    }
}

rootProject.name = 'event-sourcing-order-poc'

include 'modules'
include 'modules:common'
findProject(':modules:common')?.name = 'common'
// ... and other modules settings

include 'order'
include 'order:command-side'
findProject(':order:command-side')?.name = 'order-command-side'
include 'order:event-handler'
findProject(':order:event-handler')?.name = 'order-event-handler'
include 'order:query-side'
findProject(':order:query-side')?.name = 'order-query-side'
// ... and other sub-project settings

```

### Step 3: Define Allprojects DependencyManagement

All the used libraries should be defined in a `allprojects.dependencyManagement` closure in `build.gradle` of the root module:

```groovy title="./build.gradle"
import org.springframework.boot.gradle.plugin.SpringBootPlugin

plugins {
    id 'java'
    id 'java-library'
    id 'io.spring.dependency-management'
    id 'org.springframework.boot' apply false
    id 'com.google.cloud.tools.jib' apply false
}

allprojects {

    java {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    apply plugin: 'java'
    apply plugin: 'io.spring.dependency-management'
    apply plugin: 'java-library'

    dependencyManagement {
        imports {
            mavenBom SpringBootPlugin.BOM_COORDINATES
            mavenBom "org.springframework.cloud:spring-cloud-dependencies:${springCloudVersion}"
        }
        dependencies {
            dependency "org.springdoc:springdoc-openapi-starter-webmvc-ui:${springdocVersion}"
            dependency "io.github.openfeign:feign-micrometer:${feignMicrometerVersion}"
            dependency "org.projectlombok:lombok:${lombokVersion}"
            dependency "org.wiremock:wiremock:${wiremockVersion}"
            dependency "com.github.loki4j:loki-logback-appender:${logbackAppenderVersion}"
        }
    }

    dependencies {
        // only declare all-needed dependencies
        compileOnly "org.projectlombok:lombok:${lombokVersion}"
        annotationProcessor "org.projectlombok:lombok:${lombokVersion}"
    }

    test {
        useJUnitPlatform()
    }

}

tasks.named("jar") {
    enabled = false
}
```

in the `dependencyManagement` closure, we can first import the BOM of other dependencies project like [spring-boot-dependencies](https://mvnrepository.com/artifact/org.springframework.boot/spring-boot-dependencies) and [spring-cloud-dependencies](https://mvnrepository.com/artifact/org.springframework.cloud/spring-cloud-dependencies). Then, we can declare the version of other used libraries.

### Step4: Avoid Using `subprojects {}`  

Declaring dependency and plugin directly instead of using `subproject` in `build.gradle` for sub-modules like:

```groovy title="./order/command-side/build.gradle"
plugins {
    id 'org.springframework.boot'
    id 'com.google.cloud.tools.jib'
}

apply from: "$rootDir/gradle/jib.gradle"

dependencies {
    implementation project(":modules:common")
    implementation project(":modules:event")
    implementation project(":modules:client")
    implementation project(":modules:observation")
    implementation project(":modules:idempotency")

    implementation 'org.springframework.boot:spring-boot-starter-web'
    implementation 'org.springframework.boot:spring-boot-starter'
    implementation 'org.springframework.boot:spring-boot-starter-actuator'
    implementation 'org.springframework.kafka:spring-kafka'
    implementation 'org.springdoc:springdoc-openapi-starter-webmvc-ui'

    testImplementation 'org.springframework.boot:spring-boot-starter-test'
    testImplementation 'org.junit.jupiter:junit-jupiter-api'
    testRuntimeOnly 'org.junit.jupiter:junit-jupiter-engine'
}
```

It can be more intuitive to declare the used plugin and dependencies in each project. Thanks to the `dependencyManagement` in the root module, we can use a simple form of the declaration here in the subproject.

### Step 5: Extract Related Configuration 

Extract complex and common task config to extra files and apply them wherever needed.

In the above file `./order/command-side/build.gradle`, the important script snippet 

```
...
apply from: "$rootDir/gradle/jib.gradle"
...
``` 

will include an extra `.gradle` file, which we can group related config into one file. Let's take the `./gradle/jib.gradle` for example:

```groovy title="./gradle/jib.gradle"
jib {
    from {
        image = "openjdk:17-slim"
    }

    to.image = "noahhsu/${project.name}"
    to.tags = ["latest"]

    container {
        creationTime = 'USE_CURRENT_TIMESTAMP'
    }

}
```

In this way, we can make the `.gradle` file in the submodules/subprojects is very clean and more readable. Moreover, we can reuse these configurations in different places (e.g. `order/query-side`, `payment/command-side`, etc.).

## Summary

In conclusion, managing a multi-module Gradle project can be streamlined and elegant by adopting a structured approach to configuration. In this article, we propose a five-step method to centralize plugin and dependency version declarations and extract configurations into independent .gradle files. Besides, be cautious when using special methods to ensure the project-building logic straightforward and easy to manage. By following these steps, you can enhance the readability and maintainability of your multi-module Gradle projects.

### Reference
- [Why Avoid `subprojects {}`](https://docs.gradle.org/current/userguide/sharing_build_logic_between_subprojects.html#sec:convention_plugins_vs_cross_configuration)
- [Pull Request](https://github.com/NoahHsu/event-sourcing-order-poc/pull/72)

<script src="https://gist.github.com/NoahHsu/3fdd35ee517e541aec38af70693ad123.js?file=build.gradle"></script>