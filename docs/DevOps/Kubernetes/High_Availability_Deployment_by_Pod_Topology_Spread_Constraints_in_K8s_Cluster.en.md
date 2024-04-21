---
tags:
- Kubernetes
- Devops
- High-Availability
---
# High Availability Deployment by Pod Topology Spread Constraints in K8s Cluster

In the modern world, running a high-availability service is the most important thing for the users. As Kubernetes is getting more common, it's essential to know how to achieve a robust deployment across all the Applications. Assuming the network unreliability is handled by the Application retry and idempotency mechanism, what's left is to make sure the Applications are running well. The only threat is some "real-world" damage to the server. so we are always told to spread our application across different server-rack, data center zones, or geography regions.

In this article, we will share:

1. Related K8s labels to be used
2. How to use the **Pod Topology Spread Constraints**
3. How would it work

## Related K8s Labels to Be Used

There are some native labels that we can make use of. Since our goal is to distribute the applications among different servers, zones, and regions. The following labels denote the essential properties:

- [kubernetes.io/hostname](https://kubernetes.io/docs/reference/labels-annotations-taints/#kubernetesiohostname)<br>
  As the name means, this label shows the hostname of the node, every node will have a different name.

- [topology.kubernetes.io/region](https://kubernetes.io/docs/reference/labels-annotations-taints/#topologykubernetesioregion)<br>
  The nodes in different region will get a different value for this label.

- [topology.kubernetes.io/zone](https://kubernetes.io/docs/reference/labels-annotations-taints/#topologykubernetesiozone)<br>
  The nodes in different zone will get a different value for this label.

## Set up the deployment.yaml
In the deployment setting file for Kubernetes, We can use the [topology-spread-constraints](https://kubernetes.io/docs/concepts/scheduling-eviction/topology-spread-constraints/) to control how the Pods are assigned in the cluster. If we want our applications can be run on different nodes, zones, and regions to avoid simultaneous failures (no matter if an accident or a scheduled maintenance causes it). The naive `.yaml` file would like below:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
spec:
  # ... other properties like replicas, selector...
  template:
    metadata:
      labels:
        app: myapp
    spec:
      containers:
        # - ... the container to deploy
      topologySpreadConstraints:
        - maxSkew: 1
          topologyKey: topology.kubernetes.io/zone # or use topology.kubernetes.io/region
          whenUnsatisfiable: ScheduleAnyway
          labelSelector:
            matchLabels:
                app: myapp
        - maxSkew: 1
          topologyKey: kubernetes.io/hostname
          whenUnsatisfiable: ScheduleAnyway
          labelSelector:
            matchLabels:
              app: myapp
      # ... other properties like affinity, tolerations...
```

In this way, our pods will not concentrate on the same hardware (node, zone, or region) due to the `maxSkew` setting to one (means the difference of replicas number in different zones ( or between nodes and regions) would not be bigger than 1). The ideal process when the Pods number grows under the former Topology Spread Constraints would act like below: 

![result.gif](..%2Fresources%2Fk8s-topology%2Fresult.gif)

The Scheduler would try its best to assign the pods to satisfy these constraints. But if there is no room for a new pod in a specific node, zone, or region to satisfy that, it would still assign it to others to prevent overloading for existing pods (because we set the `whenUnsatisfiable` as `ScheduleAnyway`).

## Summary
In this article, we introduce a simple example of using `topologySpreadConstraints` to make sure our deployment can be high-availability. In this way, our service is run on different nodes, zones, and regions to prevent simultaneous failures like node broken, data center accidents, regional disasters, etc.
If you need more detail or explanation for each attribute for `topologySpreadConstraints`, please visit the official document [here](https://kubernetes.io/docs/concepts/scheduling-eviction/topology-spread-constraints/). Thanks for reading, helps this article can help you out in any way.

### Reference
- well known labels: [https://kubernetes.io/docs/reference/labels-annotations-taints/](https://kubernetes.io/docs/reference/labels-annotations-taints/)
- topology-spread-constraints: [https://kubernetes.io/docs/concepts/scheduling-eviction/topology-spread-constraints/](https://kubernetes.io/docs/concepts/scheduling-eviction/topology-spread-constraints/)
- deployment.yaml example: [https://kubernetes.io/docs/concepts/workloads/controllers/deployment/](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)
