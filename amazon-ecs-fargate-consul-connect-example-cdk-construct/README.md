# Example: Amazon ECS on AWS Fargate with Consul Connect service mesh using CDK constructs

In this example we'll configure several Amazon ECS container services running on AWS Fargate to join and communicate via a Consul Connect service mesh with a control plane hosted in Amazon EC2, using CDK constructs.

# Deploy the Consul Connect server

Create Consul connect server using following Cloudformation command:

```aws cloudformation deploy --template-file .\mesh-consul-connect.yml --stack-name ConsulMeshStack --parameter-overrides KeyName=$MY_SSH_KEY --region $AWS_REGION```

# Build CDK Constructs to implement Environment for the services

  - Import VPC details from where above Consul connect server lives

``` EC2.Vpc.fromVpcAttributes(scope: Construct, id: string, attrs: ec2.VpcAttributes) ```

 - Import SecurityGroups attached to the VPC

``` EC2.SecurityGroup.fromSecurityGroupId(scope: Construct, id: string, securityGroupId: string, options?: ec2.SecurityGroupImportOptions | undefined) ```


 - Create cluster for your services to live, inside the same VPC that you imported in the earlier stage

``` ECS.Cluster(scope: Construct, id: string, props?: ecs.ClusterProps) ```

 - Create agent role and task execution role and attach policies mentioned in the example to it

 ``` IAM.Role(scope: Construct, id: string, props: iam.RoleProps) ```

# Build CDK Constructs to implement the services

- Create greeting service using following setup:
    - Build docker image for the greeting and agent service
    ``` new DockerImageAsset(scope: Construct, id: string, props: DockerImageAssetProps) ```
    - Create separate ECR repositories for the greeting and agent image to live
    ``` new ECR.Repository(scope: Construct, id: string, props?: ecr.RepositoryProps) ```
    - Deploy greeting and agent images to their respective ECR
    ``` new ECR.ECRDeployment(scope: Construct, id: string, props: ecrdeploy.ECRDeploymentProps) ```
    - create logging configurations for service, client and proxy containers
    ``` aws-logs.LogGroup(scope: Construct, id: string, props?: awsLogs.LogGroupProps) ```
    - Create fargate task definition for the greeting service and attach taskExecutionRole and Consul agent role to it.
    ``` ECS.FargateTaskDefinition(scope: Construct, id: string, props?: ecs.FargateTaskDefinitionProps)```
    - Add Volume details to the created fargate task definition in the previous step
    ``` TaskDefinition.addVolume(volume: ecs.Volume) ```
    - Add greeting, agent and proxy container to the task definition
    ``` TaskDefinition.addContainer(id: string, props: ecs.ContainerDefinitionOptions) ```
    - Add mount points to greeting agent/client container
    ``` ContainerDefinition.addMountPoints(...mountPoints: ecs.MountPoint[]) ```
    - Add container dependencies of the greeting proxy container
    ```  ContainerDefinition.addContainerDependencies(...containerDependencies: ecs.ContainerDependency[]) ```
    - Create fargate service and attach sercurity groups, task definition, cluster, desired count and assignPublicIp to it
    ``` ECS.FargateService(scope: Construct, id: string, props: ecs.FargateServiceProps) ```

    Note: Repeat the above steps for Name and Greeter service as well