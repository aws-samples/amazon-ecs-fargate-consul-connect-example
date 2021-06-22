import * as cdk from '@aws-cdk/core';
import * as ecr from '@aws-cdk/aws-ecr';
import * as ecs from '@aws-cdk/aws-ecs';
import { DockerImageAsset } from '@aws-cdk/aws-ecr-assets';
import * as ecrdeploy from 'cdk-ecr-deployment';
import * as awsLogs from '@aws-cdk/aws-logs';
import * as ec2 from '@aws-cdk/aws-ec2'; 
import * as iam from '@aws-cdk/aws-iam';

export class AmazonEcsFargateConsulConnectExampleCdkConstructStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
//Import VPC where your consul connect server lives
const vpc = ec2.Vpc.fromVpcAttributes(this, 'Consul-Connect-VPC', {
  vpcId: '$CONSUL-CONNECT-VPC',
  availabilityZones: ['$CONSUL-CONNECT-AZ'],
  privateSubnetIds: ['$PRIVATE-SUBNETID'],
  publicSubnetIds: ['$PUBLIC-SUBNETID']
});

//Import security group attached to the above VPC
const importedSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(
  this,
  'imported-security-group',
  '$SECURITY-GROUP',
  {allowAllOutbound: true, mutable: true},
);

// Creating cluster where services will reside
const cluster = new ecs.Cluster(this, "Consul-Connect-Cluster", {
 vpc,
});

//Creating role for consul agent container in the service
const consulAgentRole = new iam.Role(this, 'ConsulAgentRole', { assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com") });

//Creating task execution role
const taskExecutionRole = new iam.Role(this, 'TaskExecutionRole', { assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com") });

//Adding policies to the consul agent role
consulAgentRole.addToPolicy(
  new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    resources: ['*'],
    actions: ['ec2:DescribeInstances', 'sts:AssumeRole'],
  })
);

//Adding policies to the  task execution role
taskExecutionRole.addToPolicy(
  new iam.PolicyStatement({
    resources: ['*'],
    actions: ['sts:AssumeRole']
  })
);

const newManagedPolicy = iam.ManagedPolicy.fromManagedPolicyArn(this, 'MyNewManagedPolicy', "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy")

taskExecutionRole.addManagedPolicy(newManagedPolicy);

//----------------------------------Greeting Service Starts Here----------------------------------------//

//Building docker image for greeting service. Docker image for greeting agent is skipped due to executable permission issues.
const greetingDockerImage = new DockerImageAsset(this, 'GreetingBuildImage', {
  directory: '/Users/pbhingre/amazon-ecs-fargate-consul-connect-example/services/greeting/src'
});

//Building docker image for greeting agent/client.
const greetingClientDockerImage = new DockerImageAsset(this, 'GreetingClientBuildImage', {
  directory: '/Users/pbhingre/amazon-ecs-fargate-consul-connect-example/services/greeting/client'
});

//Creating ECR repository for the  greeting image 
const greetingRepository = new ecr.Repository(this, 'ConsulCDKGreeting', {
  repositoryName: 'consulgreeting',
});

//Creating ECR repository for the  greeting lient/agent image 
const greetingClientRepository = new ecr.Repository(this, 'ConsulCDKGreetingClient', {
  repositoryName: 'consulgreeting-client',
});

//Deploying greeting image to greeting ECR
new ecrdeploy.ECRDeployment(this, 'ConsulGreeting', {
  src: new ecrdeploy.DockerImageName(greetingDockerImage.imageUri),
  dest: new ecrdeploy.DockerImageName(`$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/consulgreeting:latest`),
});

//Deploying greeting image to greeting ECR
new ecrdeploy.ECRDeployment(this, 'ConsulGreeting-client', {
  src: new ecrdeploy.DockerImageName(greetingClientDockerImage.imageUri),
  dest: new ecrdeploy.DockerImageName(`$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/consulgreeting-client:latest`),
});

//Create logging cofiguration for the containers
const LogGroup_greetingService = new awsLogs.LogGroup(this, 'LogGroup_greetingService', {
  retention: awsLogs.RetentionDays.ONE_WEEK,
});

const logGroup_greetingProxy = new awsLogs.LogGroup(this, 'LogGroup_greetingProxy', {
  retention: awsLogs.RetentionDays.ONE_WEEK,
});

const logGroup_greetingAgent = new awsLogs.LogGroup(this, 'LogGroup_greetingAgent', {
  retention: awsLogs.RetentionDays.ONE_WEEK,
});


//Creating task definition for the service
const greetingTaskDefinition = new ecs.FargateTaskDefinition(this, 'taskDef', {
  executionRole: taskExecutionRole,
  taskRole: consulAgentRole
});

greetingTaskDefinition.addVolume({
  name: "consul-data"
});
greetingTaskDefinition.addVolume({
  name: "consul-config"
});

//Adding greeting container to the task definition 
const greeting = greetingTaskDefinition.addContainer('greeting', {
  cpu: 256,
  image: ecs.ContainerImage.fromEcrRepository(greetingRepository, 'latest'),
  memoryLimitMiB: 512,
  environment: {
    PORT: '3000'
  },
  essential: true,
  logging: ecs.LogDriver.awsLogs({
    streamPrefix: "greetingService",
    logGroup: LogGroup_greetingService
  })
});

//Adding greeting agent to the task definition 
const greeting_agent = greetingTaskDefinition.addContainer('greeting-agent', {
  image: ecs.ContainerImage.fromEcrRepository(greetingClientRepository, 'latest'),
  memoryLimitMiB: 512,
  portMappings: [{
    containerPort: 8301,
    protocol: ecs.Protocol.TCP
  },
  {
    containerPort: 8301,
    protocol: ecs.Protocol.UDP
  },
  {
    containerPort: 8400,
    protocol: ecs.Protocol.TCP
  },
  {
    containerPort: 8500,
    protocol: ecs.Protocol.TCP
  },
  {
    containerPort: 53,
    protocol: ecs.Protocol.UDP
  }],
  logging: ecs.LogDriver.awsLogs({
    streamPrefix: "greetingAgent",
    logGroup: logGroup_greetingAgent
  })
});

greeting_agent.addMountPoints(
  {
    containerPath: "/consul/data",
    sourceVolume: "consul-data",
    readOnly: false
  },
  {
    containerPath: "/consul/config",
    sourceVolume: "consul-config",
    readOnly: false
  }
);


// Adding proxy container to the task definition
const greeting_proxy = greetingTaskDefinition.addContainer('greeting-proxy', {
  image: ecs.ContainerImage.fromRegistry('public.ecr.aws/hashicorp/consul:1.9.1'),
  memoryLimitMiB: 512,
  command: ["exec consul connect proxy -sidecar-for greeting\n"],
  entryPoint: ["/bin/sh", "-c"],
  logging: ecs.LogDriver.awsLogs({
    streamPrefix: "greetingProxy",
    logGroup: logGroup_greetingProxy
  }),
  portMappings: [{
    containerPort: 8080
  }]
  //essential: true
});

greeting_proxy.addContainerDependencies(
  {
    container: greeting_agent,
    condition: ecs.ContainerDependencyCondition.START
  }
);

//Creating Greeting service with the given task definition 
const service = new ecs.FargateService(this, "service", {
  serviceName: 'greeting',
  cluster,
  desiredCount: 1,
  taskDefinition: greetingTaskDefinition,
  assignPublicIp: true,
  securityGroup: importedSecurityGroup
});

//----------------------------------------Name Service Starts Here------------------------------------//

const nameDockerImage = new DockerImageAsset(this, 'NameBuildImage', {
  directory: '/Users/pbhingre/amazon-ecs-fargate-consul-connect-example/services/name/src'
});

const nameClientDockerImage = new DockerImageAsset(this, 'NameClientBuildImage', {
  directory: '/Users/pbhingre/amazon-ecs-fargate-consul-connect-example/services/name/client'
});

//Creating ECR repository for the name image 
const nameRepository = new ecr.Repository(this, 'ConsulCDKName', {
  repositoryName: 'consulname',
});

const nameClientRepository = new ecr.Repository(this, 'ConsulCDKNameClient', {
  repositoryName: 'consulname-client',
});

//Deploying name service image to name ECR
new ecrdeploy.ECRDeployment(this, 'ConsulName', {
  src: new ecrdeploy.DockerImageName(nameDockerImage.imageUri),
  dest: new ecrdeploy.DockerImageName(`$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/consulname:latest`),
});

new ecrdeploy.ECRDeployment(this, 'ConsulNameClient', {
  src: new ecrdeploy.DockerImageName(nameClientDockerImage.imageUri),
  dest: new ecrdeploy.DockerImageName(`$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/consulname-client:latest`),
});

//Create logging cofiguration for the containers
const LogGroup_nameService = new awsLogs.LogGroup(this, 'LogGroup_nameService', {
  retention: awsLogs.RetentionDays.ONE_WEEK,
});

const logGroup_nameProxy = new awsLogs.LogGroup(this, 'LogGroup_nameProxy', {
  retention: awsLogs.RetentionDays.ONE_WEEK,
});

const logGroup_nameAgent = new awsLogs.LogGroup(this, 'LogGroup_nameAgent', {
  retention: awsLogs.RetentionDays.ONE_WEEK,
});

//Creating task definition for the Name service
const nameTaskDefinition = new ecs.FargateTaskDefinition(this, 'nameTaskDef', {
  executionRole: taskExecutionRole,
  taskRole: consulAgentRole
});

nameTaskDefinition.addVolume({
  name: "consul-data"
});
nameTaskDefinition.addVolume({
  name: "consul-config"
});

 //Adding name container to the task definition 
 const name = nameTaskDefinition.addContainer('name', {
  cpu: 256,
  image: ecs.ContainerImage.fromEcrRepository(nameRepository, 'latest'),
  memoryLimitMiB: 512,
  environment: {
    PORT: '3000'
  },
  essential: true,
  logging: ecs.LogDriver.awsLogs({
    streamPrefix: "nameService",
    logGroup: LogGroup_nameService
  })
});

//Adding name agent to the task definition 
const name_agent = nameTaskDefinition.addContainer('name-agent', {
  image: ecs.ContainerImage.fromEcrRepository(nameClientRepository, 'latest'),
  memoryLimitMiB: 512,
  portMappings: [{
    containerPort: 8301,
    protocol: ecs.Protocol.TCP
  },
  {
    containerPort: 8301,
    protocol: ecs.Protocol.UDP
  },
  {
    containerPort: 8400,
    protocol: ecs.Protocol.TCP
  },
  {
    containerPort: 8500,
    protocol: ecs.Protocol.TCP
  },
  {
    containerPort: 53,
    protocol: ecs.Protocol.UDP
  }],
  logging: ecs.LogDriver.awsLogs({
    streamPrefix: "nameAgent",
    logGroup: logGroup_nameAgent
  })
});

name_agent.addMountPoints(
  {
    containerPath: "/consul/data",
    sourceVolume: "consul-data",
    readOnly: false
  },
  {
    containerPath: "/consul/config",
    sourceVolume: "consul-config",
    readOnly: false
  }
);

// Adding proxy container to the task definition
const name_proxy = nameTaskDefinition.addContainer('name-proxy', {
  image: ecs.ContainerImage.fromRegistry('public.ecr.aws/hashicorp/consul:1.9.1'),
  memoryLimitMiB: 512,
  command: ["exec consul connect proxy -sidecar-for name\n"],
  entryPoint: ["/bin/sh", "-c"],
  logging: ecs.LogDriver.awsLogs({
    streamPrefix: "nameProxy",
    logGroup: logGroup_nameProxy
  }),
  portMappings: [{
    containerPort: 8080
  }]
});

name_proxy.addContainerDependencies(
  {
    container: name_agent,
    condition: ecs.ContainerDependencyCondition.START
  }
);

//Creating Name service with the given task definition 
const nameService = new ecs.FargateService(this, "nameService", {
  serviceName: 'name',
  cluster,
  desiredCount: 1,
  taskDefinition: nameTaskDefinition,
  assignPublicIp: true,
  securityGroup: importedSecurityGroup
});

//----------------------------------------Greeter Service Starts Here------------------------------------//

const greeterDockerImage = new DockerImageAsset(this, 'GreeterBuildImage', {
  directory: '/Users/pbhingre/amazon-ecs-fargate-consul-connect-example/services/greeter/src'
});

const greeterClientDockerImage = new DockerImageAsset(this, 'GreeterClientBuildImage', {
  directory: '/Users/pbhingre/amazon-ecs-fargate-consul-connect-example/services/greeter/client'
});

//Creating ECR repository for the greeter image 
const greeterRepository = new ecr.Repository(this, 'ConsulCDKGreeter', {
  repositoryName: 'consulgreeter',
});

const greeterClientRepository = new ecr.Repository(this, 'ConsulCDKGreeterClient', {
  repositoryName: 'consulgreeter-client',
});

//Deploying greeter service image to greeter ECR
new ecrdeploy.ECRDeployment(this, 'ConsulGreeter', {
  src: new ecrdeploy.DockerImageName(greeterDockerImage.imageUri),
  dest: new ecrdeploy.DockerImageName(`$ACCOUNT.dkr.ecr.$REGION.amazonaws.com/consulgreeter:latest`),
});

new ecrdeploy.ECRDeployment(this, 'ConsulGreeterClient', {
  src: new ecrdeploy.DockerImageName(greeterClientDockerImage.imageUri),
  dest: new ecrdeploy.DockerImageName(`$ACCOUNT.dkr.ecr.$REGION.amazonaws.com/consulgreeter-client:latest`),
});

//Create logging cofiguration for the containers
const LogGroup_greeterService = new awsLogs.LogGroup(this, 'LogGroup_greeterService', {
  retention: awsLogs.RetentionDays.ONE_WEEK,
});

const logGroup_greeterProxy = new awsLogs.LogGroup(this, 'LogGroup_greeterProxy', {
  retention: awsLogs.RetentionDays.ONE_WEEK,
});

const logGroup_greeterAgent = new awsLogs.LogGroup(this, 'LogGroup_greeterAgent', {
  retention: awsLogs.RetentionDays.ONE_WEEK,
});

//Creating task definition for the Greeter service
const greeterTaskDefinition = new ecs.FargateTaskDefinition(this, 'greeterTaskDef', {
  executionRole: taskExecutionRole,
  taskRole: consulAgentRole
});

greeterTaskDefinition.addVolume({
  name: "consul-data"
});
greeterTaskDefinition.addVolume({
  name: "consul-config"
});

//Adding greeter container to the task definition 
 const greeter = greeterTaskDefinition.addContainer('greeter', {
  cpu: 256,
  image: ecs.ContainerImage.fromEcrRepository(greeterRepository, 'latest'),
  memoryLimitMiB: 512,
  environment: {
    PORT: '3000',
    NAME_URL: 'http://localhost:3001',
    GREETING_URL: 'http://localhost:3002'
  },
  essential: true,
  logging: ecs.LogDriver.awsLogs({
    streamPrefix: "greeterService",
    logGroup: LogGroup_greeterService
  })
});


//Adding greeter agent to the task definition 
const greeter_agent = greeterTaskDefinition.addContainer('greeter-agent', {
  image: ecs.ContainerImage.fromEcrRepository(greeterClientRepository, 'latest'),
  memoryLimitMiB: 512,
  portMappings: [{
    containerPort: 8301,
    protocol: ecs.Protocol.TCP
  },
  {
    containerPort: 8301,
    protocol: ecs.Protocol.UDP
  },
  {
    containerPort: 8400,
    protocol: ecs.Protocol.TCP
  },
  {
    containerPort: 8500,
    protocol: ecs.Protocol.TCP
  },
  {
    containerPort: 53,
    protocol: ecs.Protocol.UDP
  }],
  logging: ecs.LogDriver.awsLogs({
    streamPrefix: "greeterAgent",
    logGroup: logGroup_greeterAgent
  })
});

greeter_agent.addMountPoints(
  {
    containerPath: "/consul/data",
    sourceVolume: "consul-data",
    readOnly: false
  },
  {
    containerPath: "/consul/config",
    sourceVolume: "consul-config",
    readOnly: false
  }
);

// Adding  greeter proxy container to the task definition
const greeter_proxy = greeterTaskDefinition.addContainer('greeter-proxy', {
  image: ecs.ContainerImage.fromRegistry('public.ecr.aws/hashicorp/consul:1.9.1'),
  memoryLimitMiB: 512,
  command: ["exec consul connect proxy -sidecar-for greeter\n"],
  entryPoint: ["/bin/sh", "-c"],
  logging: ecs.LogDriver.awsLogs({
    streamPrefix: "greeterProxy",
    logGroup: logGroup_greeterProxy
  }),
  portMappings: [{
    containerPort: 8080
  }]
});

greeter_proxy.addContainerDependencies(
  {
    container: greeter_agent,
    condition: ecs.ContainerDependencyCondition.START
  }
);

//Creating a Greeter service with the given task definition 
const greeterService = new ecs.FargateService(this, "greeterService", {
  serviceName: 'greeter',
  cluster,
  desiredCount: 1,
  taskDefinition: greeterTaskDefinition,
  assignPublicIp: true,
  securityGroup: importedSecurityGroup
});
  }
}
