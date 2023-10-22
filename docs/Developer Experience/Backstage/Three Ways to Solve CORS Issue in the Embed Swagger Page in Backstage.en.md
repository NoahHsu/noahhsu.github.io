---
tags:
- Backstage
- CORS
- Developer Portal
- Bug Fix
---
# Three Ways to Solve CORS Issue in the Embed Swagger Page in Backstage

![Embed-swagger-Cors-cover.jpg](assets%2FCorsApi%2FEmbed-swagger-Cors-cover.jpg)

As we mentioned in [this article](https://noahhsu.github.io/Developer%20Experience/Backstage/Centralize%20All%20Needed%20Knowledge%20in%20One%20Developer%20Portals%20Through%20Spotify%20Backstage/) before, centralizing all the needed knowledge in one developer portal is a big improvement in daily working experience and convenience.

But we face a [CORS problem](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS/Errors) when sending requests by an embedded swagger page in the API definition. this problem will significantly reduce the functionality of swagger page, so this article proposes three ways to solve it:
1. allow the App to cross-origin for your Backstage domain
2. provide modified plain-text open API JSON and add proxy
3. change the server URL when render page and add proxy



Let's go through them in detail!

---

## Problem reproduce (As-Is)

After our basic setup in [previous article](https://medium.com/gitconnected/centralize-all-needed-knowledge-in-one-developer-portals-through-spotify-backstage-3c42c233dd64), when sending a request from the Swagger page will look like this:

![as-is-API.png](assets%2FCorsApi%2Fas-is-API.png)

here we can discover two problems:
1. the current url is localhost:3000, while the target server url is localhost:8081
2. the first problem lead to the server response with a CORS error 
  ![ai-is-network.png](assets%2FCorsApi%2Fai-is-network.png)

So by default, we can not send request through the embedded Swagger page in the Backstage.

---

## Solution (To-Be)
Here I propose three lightweight (little code modified) solutions, we can choose one of them according to the security concern, existing CI/CD process.  

### 1. allow CORS in APP 

The easiest way is to allow the App to cross-origin for your Backstage domain, if it's OK to modify your app setting, which might have these side effects: 
1. your app in test env (and add logic to disable it in prod env)
2. left some code in your codebase like (take my spring boot application for example)
   ```java title="OrderController.java"
   @RestController
   // to allow only Backstage (domain= http://localhost:3000) to send request
   @CrossOrigin(origins = "http://localhost:3000") 
   ...
   public class OrderController {...}
   ```
In this way the swagger page can successfully send request directly to the app.

### 2. provide modified plain-text json, and add proxy

#### Needed Modification
If your open API spec is provided by a static file generated in a CI/CD process, then it is a good way to add a customized step to modify the original URL to Backstage's proxy endpoint, and the Backstage backend will proxy the request and send to your app without a CORS error.

to enable the proxy setting, we have to rewrite/ add the `servers.url` string with a specific key (i.e. `/order-command` in my example). 
```json title="api-docs.json" 
{
  "openapi": "3.0.1",
  "info": {
    "title": "OpenAPI definition",
    "version": "v0"
  },
  "servers": [
    { // origin url is http://localhost:8081
      "url": "http://localhost:7007/api/proxy/order-command",
      "description": "Generated server url"
    }
  ],
  ...
}
```

and add the following setting in the `app-config.yaml` in the Backstage project

```json title="app-config.yaml"
proxy:
  '/order-command':
    target: 'http://localhost:8081'
    changeOrigin: true
    pathRewrite: 
      '^/api/proxy/order-command': '/'
```

#### Result
after starting the Backstage, we can first see these logs show the Proxy is created.
```
[1] 2023-10-22T09:14:37.849Z proxy info [HPM] Proxy created: /order-command  -> http://localhost:8081 type=plugin
[1] 2023-10-22T09:14:37.849Z proxy info [HPM] Proxy rewrite rule created: "^/api/proxy/order-command" ~> "/" type=plugin
```
then the url on Swagger will change to the proxy endpoint of Backstage backend.

![to-be_2_servers_url.png](assets%2FCorsApi%2Fto-be_2_servers_url.png)

In this case, the request will successfully be sent to the Backstage backend and be proxy to the correct App endpoint and respond normally.

![to-be_2_request.png](assets%2FCorsApi%2Fto-be_2_request.png)

### 3. change the server URL when render page and add proxy
If you have concerns about allowing CORS on App and don't have an existing CI/CD process to generate a static open API file. Then we should use a customized API entity renderer to do the URL modify task in realtime.

#### Needed Modification

Refer to this [Custom API Renderings](https://github.com/backstage/backstage/tree/master/plugins/api-docs#customizations) tutorial. we can first add `@types/swagger-ui-react` and `swagger-ui-react` to the package/app, then change the `packages/app/src/apis.ts` to a `.tsx` file and add the following (see the [diff in my commit](https://github.com/NoahHsu/backstage-demo/commit/1f8cd6b24355c480c539f876f603a410b9c56367)):
```javascript title="packages/app/src/apis.tsx"
import {ApiEntity } from '@backstage/catalog-model';
import {
apiDocsConfigRef,
defaultDefinitionWidgets
} from '@backstage/plugin-api-docs';

export const apis: AnyApiFactory[] = [
  createApiFactory({
    ...
  }),
  ScmAuth.createDefaultApiFactory(),
  // add the below code snippet
  createApiFactory({
      api: apiDocsConfigRef,
      deps: {},
      factory: () => {
        // load the default widgets
        const definitionWidgets = defaultDefinitionWidgets();
        return {
          getApiDefinitionWidget: (apiEntity: ApiEntity) => {
            // custom rendering for solve cors issue
            if (apiEntity.spec.type === 'cors-openapi') {
              let regex = /"servers":\[{"url":"([a-z]+:\/\/[a-zA-Z-.:0-9]+)"/g;
              let matches = regex.exec(apiEntity.spec.definition);
              let targetString = matches ? matches[1] : "";

              apiEntity.spec.definition = apiEntity.spec.definition.replaceAll(
               regex,
               "\"servers\":[{\"url\":\"http://localhost:7007/api/proxy/" + targetString + "\"");

               apiEntity.spec.type='openapi';
            }
            // fallback to the defaults
            return definitionWidgets.find(d => d.type === apiEntity.spec.type);
          },
        };
      },
    }),
    // add the above code snippet
];
```

finally, add the corresponding proxy setting in `app-config.yaml` like: 
```json title="app-config.yaml"
proxy:
  '/http://localhost:8081':
    target: 'http://localhost:8081'
    changeOrigin: true
    pathRewrite:
      '^/api/proxy/http://localhost:8081': 'http://localhost:8081'
```

and the only thing we need to modify the `spec.type` to cors-openapi in our API definition yaml. 

```yaml title="order-command-side-api.yaml"
apiVersion: backstage.io/v1alpha1
kind: API
metadata:
  ...
spec:
  type: cors-openapi
  lifecycle: experimental
  owner: guests
  definition:
    $text: http://localhost:8081/v3/api-docs
```

#### Result

then the url on Swagger will change to the proxy endpoint of the Backstage backend with the original url.

![to-be_3_servers_url.png](assets%2FCorsApi%2Fto-be_3_servers_url.png)

In this case, the request will also successfully be sent to the Backstage backend and be proxy to the correct App endpoint and respond normally.

![to-be_3_request.png](assets%2FCorsApi%2Fto-be_3_request.png)

---

## Summary

Using the three ways proposed in this article can solve the CORS issue with slight changes in the project or the Backstage app. This will bring more convenience when others integrate/try our API by reading on the Backstage.

The developer portal is a very powerful tool to improve developers' experience,  but it also needs some effort to build some guidelines, plugins, or mechanisms on the portal App (i.e. Backstage), which can be done by a platform engineer team or task force. After the hard work, you will find it very worthy to have a well-done developer portal.

### reference
- CORS problem: [https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS/Errors](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS/Errors)
- Custom API Renderings in Backstage: [https://github.com/backstage/backstage/tree/master/plugins/api-docs#customizations](https://github.com/backstage/backstage/tree/master/plugins/api-docs#customizations)