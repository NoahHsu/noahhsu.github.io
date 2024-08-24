---
date:
  created: 2024-08-18
authors:
  - NoahHsu
categories:
  - Spring Boot
tags:
  - Java
  - Development
  - Unit Test
  - Integration Test
---
# Spring Boot 3 Support Docker Compose Shows Easy and Consistent on Develop and Test

OutLine:
- As-Is
  - in-dev
    - makefile
    - docker compose
  - in test
    - Test-Container
    - Mock
- little addon setup to make better
  - dev
    - docker profile connect to spring profile
    ![profile_not_updated.png](resources%2Fsb-docker%2Fprofile_not_updated.png)
    - avoid build in image
  - test
    - active in test
    - shared in different module
- summary advantage
  - no prior knowledge (docker compose or makefile) for develop to run application
  - standalone (not affected by library version supported)
  - test case consistency
  - test speed performance

## As-Is
### In Development
When developing Spring Boot applications, developers often rely on Docker to create a consistent and reproducible environment. Two key tools used in this process are Makefile and Docker Compose.

- Makefile: Developers use Makefile to automate common tasks, like building Docker images and starting containers. This ensures that everyone on the team follows the same procedures, reducing the risk of environment-related bugs.

- Docker Compose: With Docker Compose, developers can easily manage multi-container applications. By defining services, networks, and volumes in a single file, Docker Compose makes it simple to spin up the entire application stack with a single command.

### In Testing
Testing in a Dockerized environment offers similar advantages. However, it requires some additional tools and configurations to ensure tests are consistent and isolated.

- Testcontainers: Testcontainers is a popular Java library that enables the use of lightweight, throwaway containers for testing. This allows developers to run integration tests against real dependencies, like databases and message brokers, without having to manually set them up.

- Mocks: For unit testing, mocks are often used to simulate the behavior of complex dependencies. While mocks are useful for isolated testing, they don't always provide the same level of assurance as integration tests with real dependencies.

## Why need spring-boot-docker-support

The "As-Is" methods for handling Docker in Spring Boot projects come with several downsides that can hinder development and testing efficiency. Relying on manually crafted Makefiles and Docker Compose configurations often requires specific knowledge, which can create a barrier for new team members and increase the risk of errors. This setup also leads to inconsistencies, as developers might configure their environments slightly differently, resulting in the classic "it works on my machine" problem. 
Additionally, the current approach lacks the seamless integration needed to ensure that environments are fully isolated from host dependencies, which can cause issues when moving from development to testing or production. Furthermore, the manual management of containers across multiple modules can be time-consuming and inefficient, slowing down the test process and making it harder to maintain consistent test results. These drawbacks highlight the need to transition to Spring Boot's Docker Compose support, which offers a more streamlined, reliable, and accessible way to manage Docker environments, ultimately reducing the overhead and potential issues associated with the current "As-Is" methods.

## Little Add-On Setup to Make It Better
To enhance the development and testing experience, consider the following improvements.

### Development
#### Docker Profile Connected to Spring Profile: 

By linking Docker profiles to Spring profiles, developers can ensure that the correct configuration is used depending on the environment. For example, a dev profile might use a local database, while a prod profile uses a remote one. This setup minimizes the chances of configuration-related issues and streamlines the development process.

#### Avoid Building in Image: 

During development, it's often unnecessary to build a full Docker image for each code change. Instead, developers can mount the source code directly into the container. This approach speeds up the development process by allowing instant feedback on code changes without the overhead of rebuilding the image.

### Testing
#### Activate Docker in Tests:

To fully leverage Docker in tests, it's essential to activate the Docker environment within the test framework. This can be done by configuring the test setup to spin up necessary Docker containers automatically. This ensures that tests run in an environment identical to production.

#### Shared Containers Across Modules:

If your application consists of multiple modules, sharing Docker containers across tests can significantly speed up the testing process. Instead of spinning up a new container for each test module, containers can be shared, reducing the startup time and resource usage.

## Summary of Advantages

Using Docker in both development and testing environments provides several key benefits:

### No Prior Knowledge Required: 

Developers don't need to be experts in Docker Compose or Makefile to get started. The setup can be standardized and documented, allowing even newcomers to the project to spin up the application quickly.

### Standalone Setup:
The application environment is entirely contained within Docker, meaning it is not affected by the host system's library versions or configurations. This reduces the "it works on my machine" problem and ensures that the application runs consistently in any environment.

### Test Case Consistency:
By using Docker for tests, you ensure that all test cases run in a consistent environment. This reduces flakiness and makes test results more reliable.

### Improved Test Performance:
Sharing Docker containers across test modules and avoiding unnecessary builds can lead to significant performance improvements. Tests run faster, which speeds up the feedback loop and improves overall productivity.

In conclusion, integrating Docker support into your Spring Boot development and testing workflow offers a streamlined, consistent, and efficient process that can significantly enhance productivity and reliability. With just a few additional configurations, you can leverage the full power of Docker to create a development environment that is both easy to use and highly effective.

### Reference
- https://docs.spring.io/spring-boot/reference/features/dev-services.html#features.dev-services.docker-compose
- wiremock json syntax: [https://wiremock.org/docs/request-matching/](https://wiremock.org/docs/request-matching/)
- wiremock docker: [https://github.com/wiremock/wiremock-docker/tree/main](https://github.com/wiremock/wiremock-docker/tree/main)