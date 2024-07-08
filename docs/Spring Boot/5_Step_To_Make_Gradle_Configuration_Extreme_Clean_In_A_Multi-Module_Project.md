# 5 Step To Make Gradle Configuration Extreme Clean In a Multi-Module Project

In a multi-module Gradle project, there are many tasks to handle during the build process. Using Gradle to manage dependency version control, plugin usage, build logic, and more is a popular and effective approach. However, achieving these tasks requires a lot of configuration scripts, which can make the file more complicated, and more difficult for development. In this article, we will demonstrate a clean and efficient way to manage configuration files. The needed steps are as follows:

1. extract version declaring in `gradle.properties`.
2. define all plugin and repository in `settings.gradle`.
3. define all library in the `allprojects.dependencyManagement` in `./build.gradle`.
4. declaring dependency and plugin directly instead of using `subproject` in submodule.
5. extract complex and common task config to extra file and apply wherever need it.

(Take a look at my [repository](https://github.com/NoahHsu/event-sourcing-order-poc) or [refactor PR](https://github.com/NoahHsu/event-sourcing-order-poc/pull/72), if you can't wait to find out how it looks.)

## Step By Step Demonstration

### Step1: Extract Version Declaration

We can extract version declaring in a `gradle.properties` file. Besides, we can also define some gradle argument like below:

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

### Step2: Define Used Plugins and Maven Source 

We can define all the used plugins and source maven repository in a `settings.gradle`.:

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

### Step3: Define Allprojects DependencyManagement

We can define all the used libraries in a `allprojects.dependencyManagement` closure in `./build.gradle`:

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

Declaring dependency and plugin directly instead of using `subproject` in `build.gradle` for submodule like:

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

It can be more clear and intuitive to declare used plugin and dependencies in each project. Thanks to the `dependencyManagement` in the root module, we can use a simple form of declaration here in subproject.

### Step5: Extract Related Configuration 

Extract complex and common task config to extra file and apply wherever need it.

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

In this way, we can make the `.gradle` file in the submodules/subprojects very clean and more readability. Moreover, we can reuse these configurations in different place (e.g. `order/query-side`, `payment/command-side`, etc.).

## Summary

In conclusion, managing a multi-module Gradle project can be streamlined and elegant by adopting a structured approach to configuration. In this article, we propose a five-step method to centralize plugin and dependency version declarations and extract configurations into independent .gradle files. Besides, be cautious when using special methods to ensure the project building logic straightforward and easy to manage. By following these steps, you can enhance the readability and maintainability of your multi-module Gradle projects.

### Reference
- [Why Avoid `subprojects {}`](https://docs.gradle.org/current/userguide/sharing_build_logic_between_subprojects.html#sec:convention_plugins_vs_cross_configuration)
- [Pull Request](https://github.com/NoahHsu/event-sourcing-order-poc/pull/72)