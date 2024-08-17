---
date:
  created: 2023-07-31
authors:
  - NoahHsu
categories:
  - Developer Experience
tags:
  - Backstage
  - Developer Portal
---
# Centralize All Needed Knowledge in One Developer Portals Through Spotify Backstage
![backstage_intro.jpg](resources%2Fintro%2Fbackstage_intro.jpg){ align="center" }

A developer portal is designed to enhance the developer experience by uniting all the essential knowledge required for development, maintenance, monitoring, and more, into a single platform. Backstage fulfills this objective through its core features, which include:

- [Software catalog](https://backstage.io/docs/features/software-catalog/): This feature allows users to define relationships between systems, components, and APIs, while also providing API definitions.
- [Kubernetes](https://backstage.io/docs/features/kubernetes/): Backstage enables developers to check the health of target services within the Kubernetes cluster.
- [Software template](https://backstage.io/docs/features/software-templates/): Backstage offers a variety of templates that empower developers to initiate new projects swiftly, incorporating all necessary implementations such as CI/CD templates, company policies, and guidelines.
- [TechDoc](https://backstage.io/docs/features/techdocs/) and [Searching](https://backstage.io/docs/features/search/): Backstage integrates all relevant markdown documents, effectively centralizing them and eliminating scattering across GitHub README, company Wiki, company blog, etc.

<!-- more -->

Doesn’t the prospect of such a portal sound promising and exciting for developers? In this article, we will demonstrate how to integrate a Spring Boot application into Backstage using my personal GitHub repository as an example. Here is the related PR and Repository:

project to onboard backstage: [My PR on project](https://github.com/NoahHsu/event-sourcing-order-poc/pull/63)
My Custom Backstage App: [main branch](https://github.com/NoahHsu/backstage-demo)

### Outline
- prerequisites
- Add Software Catalog (System, Component, API)
- Add TechDoc
- Summary

Note: Kubernetes and Software template is not included in this article since integrating Kubernetes is not so convenient for me to run on my laptop, and the latter is way more complex, I might write another article to focus on it.

---

## Prerequisites
- A local backstage App Running: please refer to the [Get Started](https://backstage.io/docs/getting-started/) and [Configure backstage](https://backstage.io/docs/getting-started/configuration) in [backstage.io](https://backstage.io/docs/overview/what-is-backstage). (I use node-18.16.1 in my case)
- Other repositories/ projects to onboard in Backstage: in my case is my [event-sourcing-order-poc project](https://github.com/NoahHsu/event-sourcing-order-poc).

Following the tutorial in the backstage.io, we should able to run the backstage app by running `yarn dev` and login with a GitHub account(we can run `yarn install` after you install some plugins and face an error when running `yarn dev`).

![UI-overview.png](resources%2Fintro%2FUI-overview.png)

Then, is time to add an existing project into your backstage App.

---

## Add Software Catalog

First, we have to add the `.yaml` file to our project. Since my project is kind of a mono-repo (contains multiple components, and APIs), I refer to the [file structure](https://github.com/backstage/backstage/tree/master/packages/catalog-model/examples) for the [backstage demo site](https://demo.backstage.io/catalog?filters%5Bkind%5D=component&filters%5Buser%5D=owned). Here is a quick view of the whole config file in my project for onboarding Backstage:

![folder_structure.png](resources%2Fintro%2Ffolder_structure.png)

In this structure, we can register all the components by only importing the `all.yaml` into backstage app. Here are three ways to do so depending on where is the `all.yaml`:

- On the GitHub repository
  1. import the `all.yaml` file URL through UI, refer to the [tutorial](https://github.com/NoahHsu/event-sourcing-order-poc/blob/master/backstage/all.yaml).
  2. modify the `catalog.locations` part in `app-config.yaml` for the backstage project and restart the App, the config is like the below:

      ```yaml title="app-config.yaml"
      ...
      catalog:
        import:
          ...
        rules:
          ...
        locations:
          - type: url
            target: https://github.com/NoahHsu/event-sourcing-order-poc/blob/master/backstage/all.yaml
      ...
      ```
- In the local file system
  3. you can only modify the `catalog.locations` part in `app-config.yaml` for the backstage project and restart the App, the config is like the one below ( in my case, the projects of `event-sourcing-order-poc` and `backstage` are in the same folder):

      ```yaml title="app-config.yaml"
      ...
      catalog:
        import:
          ...
        rules:
          ...
        locations:
          - type: file
            target: ../../../event-sourcing-order-poc/backstage/all.yaml
            # Local example data, file locations are relative to the backend process, typically `packages/backend`
      ...
      ```
  
### Config Component

Config in each component’s file is similar, here provide the [`order-command-side-component.yaml`](https://github.com/NoahHsu/event-sourcing-order-poc/blob/master/backstage/components/order-command-side-component.yaml) as an example and comments on some notable settings.

```yaml title="order-command-side-component.yaml"
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: order-command
  description: command side of order aggregate
  annotations:
    # control the link of "View Source" button in "About" block
    backstage.io/source-location: url:https://github.com/NoahHsu/event-sourcing-order-poc
  links: 
    # each link will be list in Links block
    - url: https://github.com/NoahHsu/event-sourcing-order-poc/tree/master/order/command-side
      title: Server Root
      # value refer to https://github.com/backstage/backstage/blob/master/packages/app-defaults/src/defaults/icons.tsx#L39
      icon: github
spec:
  type: service
  lifecycle: experimental
  # refer to the name in System .yaml, affect the relations-graph.
  system: event-sourcing-poc
  owner: guest
  providesApis:
    # refer to the name in API .yaml, affect the relations-graph.
    - order-command
```

The page ends up like the below image:

![component_page.png](resources%2Fintro%2Fcomponent_page.png)

### Config API Doc

For the API Doc, all the points are to provide the API definition (plain text or URL ). In my example, I run my `event-sourcing-order-poc project` by docker-compose, and the `spring-doc` will auto-generate the [OpenAPI Specification](https://swagger.io/specification/) and host on the server (i.g. http://localhost:8083/v3/api-docs.yaml). We only need to provide it in the `spec.definition`.

```yaml title="order-query-side-api.yaml"
apiVersion: backstage.io/v1alpha1
kind: API
metadata:
  name: order-query
  description: The order-query API
  tags:
    - order
    - query
    - rest
  links:
    - url: https://github.com/NoahHsu/event-sourcing-order-poc/tree/master/order/query-side
      title: Server Root
      icon: github
spec:
  type: openapi
  lifecycle: experimental
  owner: guests
  definition:
    $text: http://localhost:8083/v3/api-docs.yaml
```

If we want to provide it in a static json text, we can change the definition like this:

```yaml
definition: |
    {"openapi":"3.0.1","info":{"title":"OpenAPI definition","version":"v0"},"servers":[{"url":"http://localhost:7007/api/proxy","description":"Generated server url"}],"paths":{"/api/v1/orders":{"post":{"tags":["order-controller"],"operationId":"createOrder","requestBody":{"content":{"application/json":{"schema":{"$ref":"#/components/schemas/Order"}}},"required":true},"responses":{"200":{"description":"OK","content":{"application/json":{"schema":{"$ref":"#/components/schemas/Order"}}}}}}},"/api/v1/orders/complete":{"post":{"tags":["order-controller"],"operationId":"completeOrder","requestBody":{"content":{"application/json":{"schema":{"$ref":"#/components/schemas/Order"}}},"required":true},"responses":{"200":{"description":"OK","content":{"application/json":{"schema":{"type":"object","additionalProperties":{"type":"string"}}}}}}}}},"components":{"schemas":{"Order":{"type":"object","properties":{"id":{"type":"string"}}}}}}
```

For now, if we run the Backstage App, we will encounter the URL not allowed to read error. So we have to add the `reading.allow.host` into the `app-config.yaml` in the Backstage project like this as the [tutorial](https://backstage.io/docs/features/software-catalog/descriptor-format#substitutions-in-the-descriptor-format) says:

```yaml title="app-config.yaml"
backend:
  ...
  reading:
    allow:
      - host: localhost:8081
      - host: localhost:8083
  ...
```

As a result, after restarting the Backstage App no longer complain about the issue, and we can browse the API-Doc on Backstage smoothly.

![apis.png](resources%2Fintro%2Fapis.png)

![api-entity.png](resources%2Fintro%2Fapi-entity.png)

![swagger.png](resources%2Fintro%2Fswagger.png)

It looks nice, but I'm facing the CORS issue when I try to use the “Try it out” function on the Swagger UI. Then I found three satisfying solutions by using the [Backstage proxy](https://backstage.io/docs/plugins/proxying) or just enable `CrossOrigin` on my server. Please check it out on my another article [Three Ways to Solve CORS Issue in the Embed Swagger Page in Backstage](/Software%20Engineering%20Blog/2023/10/23/three-ways-to-solve-cors-issue-in-the-embed-swagger-page-in-backstage)

---

## Add ThchDoc

To add TechDoc (`.md` file) with our project into Backstage App we have to provide more settings to tell Backstage where to find the documents. Here is a quick view of the whole config file in my project for adding techDoc in the Backstage App.

![techDoc_folder.png](resources%2Fintro%2FtechDoc_folder.png)

### Basic Setting
First, we have to prepare a `mkdocs.yml` file like this:
```yaml title="mkdocs.yml"
site_name: event-sourcing-poc

# telling backstage how to render the navigator in sidebar
nav: 
  - Overview: index.md
  - Quick Start: run.md
  - Business Logic:
      - Event-Stream: event-stream.md
      - Order: order.md
      - Payment: payment.md
      - Shipment: shipment.md
  - System Architecture : system-architecture.md
  - Code Structure: code-structure.md

plugins:
  - techdocs-core
  # kroki is optional for support markdown with mermaid diagram
  - kroki
```

Then add an annotation in the `.yaml` file for any kind (in my example, I put it in the System kind) with value and point to the directory that contains the `mkdocs.yml`(my kind System is declared in `all.yaml` in the same folder with the `mkdocs.yml`).

```yaml title="all.yaml"
...
---
apiVersion: backstage.io/v1alpha1
kind: System
metadata:
  name: event-sourcing-poc
  annotations:
    backstage.io/techdocs-ref: dir:.
    github.com/project-slug: NoahHsu/event-sourcing-order-poc
spec:
  owner: guests
```

The final step is to add two lines to the `packages/backend/Dockerfile` in the Backstage App like below:

```Dockerfile title="packages/backend/Dockerfile"
...
RUN apt-get update && apt-get install -y python3 python3-pip
RUN pip3 install mkdocs-techdocs-core==1.1.7

USER node # put the above two lines before this existing line
...
```

### Support Mermaid

If our `.md` file contains [mermaid diagrams](https://github.com/mermaid-js/mermaid), we have to add a plugin, kroki to help generate it. As the [tutorial](https://backstage.io/docs/features/techdocs/how-to-guides/#how-to-add-mermaid-support-in-techdocs) said, we should build a Docker image on our own with a Dockerfile like [this](https://github.com/NoahHsu/backstage-demo/blob/main/kroki/Dockerfile):

```Dockerfile title="kroki/Dockerfile"
FROM python:3.10-alpine

RUN apk update && apk --no-cache add gcc musl-dev openjdk11-jdk curl graphviz ttf-dejavu fontconfig

RUN pip install --upgrade pip && pip install mkdocs-techdocs-core==1.2.0

RUN pip install mkdocs-kroki-plugin

ENTRYPOINT [ "mkdocs" ]
```

with a command like:

```shell
docker build . ${the-image-name}
```

Then tell the Backstage to use this image to generate techDoc in the `app-config.yaml`.

```yaml title="app-config.yaml" 
...
techdocs:
  builder: 'local'
  generator:
    runIn: 'docker'
    dockerImage: {the-image-name}
    pullImage: false
  publisher:
    type: 'local' # Alternatives - 'googleGcs' or 'awsS3'. Read documentation for using alternatives.
...
```

Then we should modify the .md file itself to use “kroki-mermaid” instead of “mermaid” ( it’s a little inconvenient though) like this:

````shell
```kroki-mermaid
{kind of diagram i.e. C4Context}
{the original contents}
```
````

Finally, we can restart the Backstage App and see the result:

![techDoc_Link.png](resources%2Fintro%2FtechDoc_Link.png)

We can access the techDocs either by the link in a resource (i.e. System, Component…) with the annotation (above picture) or the Documentation list (below picture).

![techDoc_list.png](resources%2Fintro%2FtechDoc_list.png)

After we access the page, we can see the Backstage start to generate the documents. After a moment, we can see the result:

![techDocDemo1.png](resources%2Fintro%2FtechDocDemo1.png)

With a navigator in the left sidebar, and a table of contents in the right side.

![techDocDemo2.png](resources%2Fintro%2FtechDocDemo2.png)

it can also show the mermaid-diagram.

![mermaid.png](resources%2Fintro%2Fmermaid.png)

Sweet!

---

## Summary
This article show how to enhance the developer experience by integrating Our Apps into Backstage, which is designed to centralize all essential knowledge required for development, maintenance, and monitoring.

Here provides a step-by-step guide focus on how to add software catalog to configure components and APIs. Then also include TechDocs to keep all things together.

Here is the related PR and Repository:

- project to onboard backstage: [My PR on project](https://github.com/NoahHsu/event-sourcing-order-poc/pull/63)
- My Custom Backstage App: [main branch](https://github.com/NoahHsu/backstage-demo)

### Reference
- Backstage: [https://backstage.io/docs/overview/what-is-backstage](https://backstage.io/docs/overview/what-is-backstage)
- Backstage demo: [https://demo.backstage.io/catalog?filters%5Bkind%5D=component&filters%5Buser%5D=owned](https://demo.backstage.io/catalog?filters%5Bkind%5D=component&filters%5Buser%5D=owned)
- catalog example: [https://github.com/backstage/backstage/blob/master/packages/catalog-model/examples/apis/petstore-webhook.oas.yaml](https://github.com/backstage/backstage/blob/master/packages/catalog-model/examples/apis/petstore-webhook.oas.yaml)
- default icon: [https://github.com/backstage/backstage/blob/master/packages/app-defaults/src/defaults/icons.tsx#L39](https://github.com/backstage/backstage/blob/master/packages/app-defaults/src/defaults/icons.tsx#L39)



