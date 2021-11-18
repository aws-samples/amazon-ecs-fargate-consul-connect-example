# Example CDK implementation - Amazon ECS on AWS Fargate with Consul Connect service mesh

In this example we'll configure one Consul server in VPC with TLS and gossip encryption enabled. Using [AWS CDK ECS service extension for Consul](https://github.com/aws-ia/ecs-consul-mesh-extension), we'll create and deploy the application stack that will launch ECS cluster with sample `greeter` application connected to Consul service mesh.

## Pre-requisites:
* AWS CLI with valid AWS account credentials configured.
* The AWS CDK uses Node.js (>= 10.13.0, except for versions 13.0.0 - 13.6.0). A version in active long-term support (14.x at this writing) is recommended.
* We highly recommend to use an IDE that supports code-completion and syntax highlighting, i.e. VSCode, AWS Cloud9, Atom, etc.
* AWS CDK Toolkit, you can install it via: `npm install -g aws-cdk`

## Step 1: Create the project directory
First create an empty directory on your system, initialize Typescript CDK project and install NPM packages.

```
mkdir app && cd app
cdk init --language typescript
cdk bootstrap aws://{ACCOUNT}/{REGION}

npm install @aws-cdk/core @aws-cdk/aws-ec2 @aws-cdk/aws-ecs @aws-cdk/aws-iam @aws-cdk/aws-secretsmanager @aws-cdk-containers/ecs-service-extensions @aws-quickstart/ecs-consul-mesh-extension
npm update
```

## Step 2: Create and Deploy the VPC Environment 
Next we're going to create the VPC Environment for launching the Consul server and the microservices.
You will need to use your public IP and it's CIDR set to `$ALLOWED_IP_CIDR`.
Example: `ALLOWED_IP_CIDR=$(curl -s ifconfig.me)/32`

### Create new environment
Create a new `lib/shared-props.ts` file
```ts
import * as cdk from '@aws-cdk/core';

export interface EnvironmentInputProps extends cdk.StackProps {
  envName: string;
  allowedIpCidr: string;
}
```

`lib/environment.ts`
```ts
import * as cdk from '@aws-cdk/core';
import * as ec2 from "@aws-cdk/aws-ec2";
import { EnvironmentInputProps } from './shared-props';

export class Environment extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, inputProps: EnvironmentInputProps) {
    super(scope, id, inputProps);
    
    const vpc = new ec2.Vpc(this, 'ConsulVPC', {
      subnetConfiguration: [{
          name: 'PublicSubnet',
          subnetType: ec2.SubnetType.PUBLIC,
        }]    
    });  
    const serverSecurityGroup = new ec2.SecurityGroup(this, 'ConsulServerSecurityGroup', {
      vpc,
      description: 'Access to the ECS hosts that run containers',
    });
    serverSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(inputProps.allowedIpCidr), 
      ec2.Port.tcp(22), 
      'Allow incoming connections for SSH over IPv4');
  }
}
```

### Modify app entry point `bin/app.ts`
```ts
#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { Environment } from '../lib/environment';

const app = new cdk.App();

// Environment
var allowedIPCidr = process.env.ALLOWED_IP_CIDR || `$ALLOWED_IP_CIDR`;
const environment = new Environment(app, 'ConsulEnvironment', {
    envName: 'test',
    allowedIpCidr: allowedIPCidr,
});
```

### Deploy the environment
```
// Make sure to set the environment variable $ALLOWED_IP_CIDR
cdk synth
cdk deploy
```

## Step 3: Create the Consul Server
Next we're going to create the Consul server stack. This stack will automatically configure Consul with TLS and gossip encryption. There will be two AWS Secrets Manager secrets created after successful deployment. You need to have EC2 key pair in the target region, change `$MY_KEY_NAME` with your EC2 key pair name.

### Update Environment Stack properties to be reused by other stacks
Update `lib/shared-props.ts` file to share the outputs across stacks
```ts
import * as ec2 from '@aws-cdk/aws-ec2';

export interface EnvironmentOutputProps extends cdk.StackProps {
  envName: string;
  vpc: ec2.Vpc;
  serverSecurityGroup: ec2.SecurityGroup;
}
```

Update `lib/environment.ts`

```ts
import { EnvironmentInputProps, EnvironmentOutputProps } from './shared-props';

// Set a class variable
  public readonly props: EnvironmentOutputProps;

// Set them in the constructor at the very end
    this.props = {
      envName: inputProps.envName,
      vpc,
      serverSecurityGroup,
    };
```

###  Consul Server setup
Create input props `lib/shared-props.ts` 
```ts
export interface ServerInputProps extends cdk.StackProps {
  envProps: EnvironmentOutputProps,
  keyName: string,
}
```

Create `lib/consul-server.ts`
```ts
import * as fs from 'fs';
import * as cdk from '@aws-cdk/core';
import * as ec2 from "@aws-cdk/aws-ec2";
import * as iam from "@aws-cdk/aws-iam";
import { ServerInputProps } from './shared-props';

export class ConsulServer extends cdk.Stack {
  public readonly serverTag: {[key:string]: string};
  public readonly datacenter: string;

  constructor(scope: cdk.Construct, id: string, inputProps: ServerInputProps) {
    super(scope, id, inputProps);
    
    const ami = new ec2.AmazonLinuxImage({
      generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
    });

    // Role to allow Consul server to write to secrets manager
    const role = new iam.Role(this, 'ConsulSecretManagerRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
    });
    role.addToPolicy(new iam.PolicyStatement({
      resources: [`arn:${cdk.Stack.of(this).partition}:secretsmanager:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:secret:*`],
      actions: ['secretsmanager:CreateSecret'],
      conditions: {"ForAnyValue:StringLike": {"secretsmanager:Name": ["my_consul-agent-ca*","my_consul-gossip-key*"]}},
    }));

    const userData = ec2.UserData.forLinux();
    const userDataScript = fs.readFileSync('./lib/user-data.txt', 'utf8');
    userData.addCommands(userDataScript);    
    const consulInstanceName = 'ConsulInstance';
    userData.addCommands(
    `# Notify CloudFormation that the instance is up and ready`,
    `yum install -y aws-cfn-bootstrap`,
    `/opt/aws/bin/cfn-signal -e $? --stack ${cdk.Stack.of(this).stackName} --resource ${consulInstanceName} --region ${cdk.Stack.of(this).region}`);

    const vpc = inputProps.envProps.vpc;
    const consulServer = new ec2.Instance(this, consulInstanceName, {
      vpc: vpc,
      securityGroup: inputProps.envProps.serverSecurityGroup,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3,ec2.InstanceSize.LARGE),
      machineImage: ami,
      keyName: inputProps.keyName,
      role: role,
      userData: userData,
    });
    var cfnInstance = consulServer.node.defaultChild as ec2.CfnInstance
    cfnInstance.overrideLogicalId(consulInstanceName);

    this.datacenter = 'dc1';
    
    const tagName = 'Name'
    const tagValue = inputProps.envProps.envName + '-consul-server';
    cdk.Tags.of(scope).add(tagName, tagValue);
    const serverTag = { tagName: tagValue };
    this.serverTag = serverTag;

    new cdk.CfnOutput(this, 'ConsulSshTunnel', {
      value: `ssh -i "~/.ssh/`+ inputProps.keyName + `.pem" ` +
       `-L 127.0.0.1:8500:` + consulServer.instancePublicDnsName + `:8500 ` +
       `ec2-user@` + consulServer.instancePublicDnsName,
      description: "Command to run to open a local SSH tunnel to view the Consul dashboard",
    });
  }
}
```

### Modify app entry point `bin/app.ts`
Add the following

```ts
import { ConsulServer } from '../lib/consul-server';

// Consul Server
var keyName = process.env.MY_KEY_NAME || `$MY_KEY_NAME`;
const server = new ConsulServer(app, 'ConsulServer', {
    envProps: environment.props,
    keyName,
});
```

### Deploy the server
```
// Make sure to set the variable $MY_KEY_NAME
cdk synth
cdk deploy --all
```

## Step 4: Prepare the Environment for Consul Client

### Setup Consul Client Security Group
Update `lib/shared-props.ts` in EnvironmentOutputProps to also add:
```ts
  clientSecurityGroup: ec2.SecurityGroup;
```

Update `lib/environment.ts` to add a security group for Consul Clients
```ts 
    const clientSecurityGroup = new ec2.SecurityGroup(this, 'ConsulClientSecurityGroup', {
      vpc,
    });
    clientSecurityGroup.addIngressRule(
      clientSecurityGroup,
      ec2.Port.tcp(8301),
      'allow all the clients in the mesh talk to each other'
    );
    clientSecurityGroup.addIngressRule(
      clientSecurityGroup,
      ec2.Port.udp(8301),
      'allow all the clients in the mesh talk to each other'
    );

    this.props = {
      envName: inputProps.envName,
      vpc,
      serverSecurityGroup,
      clientSecurityGroup
    };
```
### Setup Secret variables
Step 3 `ConsulServer` stack launched the Consul Server, which created two AWS Secrets Manager secrets for Agent CA and Gossip Key. Use AWS console / CLI to retrieve these values (Note that this output is not visible on the CloudFormation stack). Replace `$CONSUL_AGENT_CA_ARN` with the ARN of Secrets Manager Agent CA. Replace `$CONSUL_GOSSIP_KEY_ARN` with the ARN of Secrets Manager Agent Gossip.

Update `lib/shared-props.ts` to create a new 
```ts
import * as secretsmanager from '@aws-cdk/aws-secretsmanager';

export class ServerOutputProps {
  serverTag: {[key: string]: string};
  serverDataCenter: string;
  agentCASecret: secretsmanager.ISecret;
  gossipKeySecret: secretsmanager.ISecret;

  constructor(serverScope: ConsulServer, agentCASecretArn: string, gossipKeySecretArn: string) {
    this.serverTag = serverScope.serverTag;
    this.serverDataCenter = serverScope.datacenter;
    this.agentCASecret = secretsmanager.Secret.fromSecretAttributes(serverScope, 'ImportedConsulAgentCA', {
      secretArn: agentCASecretArn
    });
    this.gossipKeySecret = secretsmanager.Secret.fromSecretAttributes(serverScope, 'ImportedConsulGossipKey', {
      secretArn: gossipKeySecretArn
    });
  }
}
```

Update `bin/app.ts` to setup the secrets to be passed to the next stage 
```ts
import { ServerOutputProps } from '../lib/shared-props';

var agentCASecretArn = process.env.CONSUL_AGENT_CA_ARN || `$CONSUL_AGENT_CA_ARN`;
var gossipKeySecretArn= process.env.CONSUL_GOSSIP_KEY_ARN || `$CONSUL_GOSSIP_KEY_ARN`;
const serverProps = new ServerOutputProps(server, agentCASecretArn, gossipKeySecretArn);
```

### Create an environment for ECS

Modify EnvironmentOutputProps
```ts
import * as extensions from "@aws-cdk-containers/ecs-service-extensions";

// add to EnvironmentOutputProps
  ecsEnvironment: extensions.Environment;

```

Update environment.ts
```ts
import * as ecs from "@aws-cdk/aws-ecs";
import * as extensions from "@aws-cdk-containers/ecs-service-extensions";

    const ecsCluster = new ecs.Cluster(this, "ConsulMicroservicesCluster", {
      vpc: vpc,
    });

    const ecsEnvironment = new extensions.Environment(scope, 'ConsulECSEnvironment', {
      vpc,
      cluster: ecsCluster,
    });
 
    this.props = {
      envName: inputProps.envName,
      vpc,
      serverSecurityGroup,
      clientSecurityGroup,
      ecsEnvironment,
    };
```

### Deploy the environment
```
cdk synth
cdk deploy --all
```

## Step 5: Build and Deploy Microservices with Consul Clients

### Create a new Microservice stack `lib/microservices.ts`
```ts
import * as cdk from '@aws-cdk/core';
import * as ecs from '@aws-cdk/aws-ecs';
import * as consul_ecs from '@aws-quickstart/ecs-consul-mesh-extension';
import * as ecs_extensions from "@aws-cdk-containers/ecs-service-extensions";
import { EnvironmentOutputProps, ServerOutputProps } from './shared-props';

export class Microservices extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, envProps:EnvironmentOutputProps, serverProps: ServerOutputProps) {
      super(scope, id, {});

      // Consul Client Base Configuration
      const retryJoin = new consul_ecs.RetryJoin({ 
        region: cdk.Stack.of(this).region, 
        tagName: serverProps.serverTag.key, 
        tagValue: serverProps.serverTag.tagValue});
      const baseProps = {      
        retryJoin,
        consulClientSecurityGroup: envProps.clientSecurityGroup,
        consulServerSecurityGroup: envProps.serverSecurityGroup,
        consulCACert: serverProps.agentCASecret,
        gossipEncryptKey: serverProps.gossipKeySecret,
        tls: true,
        consulDatacenter: serverProps.serverDataCenter,
      };
    }
  }
}
```

### Modify app entry point `bin/app.ts`
```ts
// Microservices with Consul Client
const microservices = new Microservices(app, 'ConsulMicroservices', environment.props, serverProps);
```

### Add the `name` service in `lib/microservices.ts`
```ts
      const nameDescription = new ecs_extensions.ServiceDescription();
      nameDescription.add(new ecs_extensions.Container({
        cpu: 1024,
        memoryMiB: 2048,
        trafficPort: 3000,
        image: ecs.ContainerImage.fromRegistry('nathanpeck/name')
      }));
      nameDescription.add(new consul_ecs.ECSConsulMeshExtension({
        ...baseProps,
        serviceDiscoveryName: 'name',
      }));
      nameDescription.add(new ecs_extensions.AssignPublicIpExtension());
      const name = new ecs_extensions.Service(this, 'name', {
        environment: envProps.ecsEnvironment,
        serviceDescription: nameDescription
      });
```

### Add the `greeting` service in `lib/microservices.ts`
```ts
      // GREETING service
      const greetingDescription = new ecs_extensions.ServiceDescription();
      greetingDescription.add(new ecs_extensions.Container({
        cpu: 1024,
        memoryMiB: 2048,
        trafficPort: 3000,
        image: ecs.ContainerImage.fromRegistry('nathanpeck/greeting')
      }));
      greetingDescription.add(new consul_ecs.ECSConsulMeshExtension({
        ...baseProps,
        serviceDiscoveryName: 'greeting',
      }));
      greetingDescription.add(new ecs_extensions.AssignPublicIpExtension());
      const greeting = new ecs_extensions.Service(this, 'greeting', {
        environment: envProps.ecsEnvironment,
        serviceDescription: greetingDescription,
      });
```

### Add the `greeter` service in `lib/microservices.ts`
```ts
      // GREETER service
      const greeterDescription = new ecs_extensions.ServiceDescription();
      greeterDescription.add(new ecs_extensions.Container({
        cpu: 1024,
        memoryMiB: 2048,
        trafficPort: 3000,
        image: ecs.ContainerImage.fromRegistry('nathanpeck/greeter'),
      }));
      greeterDescription.add(new consul_ecs.ECSConsulMeshExtension({
        ...baseProps,
        serviceDiscoveryName: 'greeter',
      }));
      greeterDescription.add(new ecs_extensions.AssignPublicIpExtension());
      greeterDescription.add(new ecs_extensions.HttpLoadBalancerExtension());
      const greeter = new ecs_extensions.Service(this, 'greeter', {
        environment: envProps.ecsEnvironment,
        serviceDescription: greeterDescription,
      });
```

### As final touch, connect `greeter` to `greeting` and `name` services
```ts
      // CONSUL CONNECT
      greeter.connectTo(name, 3000);
      greeter.connectTo(greeting, 3001);
```

### Deploy the app

From your terminal, run:

```
cdk deploy --all
```

![AWS CDK toolkit output showing the ELB URL](imgs/cdk-output.png)

Get the ELB URL from the output and hit it on your browser to check the result

![Browser output showing the random greeting and name output](imgs/elb-output.png)

You can use the string ConsulSshTunnel from the ConsulServer output to create SSH tunnel to the Consul server and then access it's UI from http://localhost:8500/ui/


## Step 6: Clean up

From your terminal, destroy all stacks

```
cdk destroy --all
```

## Reference

* In hurry? see the full example [here](app/)
* Check the [ECS Consul Mesh CDK repo](https://github.com/aws-ia/ecs-consul-mesh-extension)
