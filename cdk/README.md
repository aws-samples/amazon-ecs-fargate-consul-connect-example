# Example CDK implementation - Amazon ECS on AWS Fargate with Consul Connect service mesh

In this example we'll configure one Consul server in VPC with TLS and gossip encryption enabled. Using [AWS CDK ECS service extension for Consul](https://github.com/aws-ia/ecs-consul-mesh-extension), we'll create and deploy the application stack that will launch ECS cluster with sample `greeter` application connected to Consul service mesh.

## Pre-requisites:
* AWS CLI with valid AWS account credentials configured.
* The AWS CDK uses Node.js (>= 10.13.0, except for versions 13.0.0 - 13.6.0). A version in active long-term support (14.x at this writing) is recommended.
* We highly recommend to use an IDE that supports code-completion and syntax highlighting, i.e. VSCode, AWS Cloud9, Atom, etc.
* AWS CDK Toolkit, you can install it via: `npm install -g aws-cdk`

### Step 1: Create the project directory
First create an empty directory on your system, initialize Typescript CDK project and install NPM packages.

```
mkdir app && cd app
cdk init --language typescript
cdk bootstrap aws://{ACCOUNT}/{REGION}

npm install @aws-cdk/core @aws-cdk/aws-ec2 @aws-cdk/aws-ecs @aws-cdk/aws-secretsmanager @aws-cdk-containers/ecs-service-extensions @aws-quickstart/ecs-consul-mesh-extension
npm update
```

## Step 2: Create and Deploy the VPC Environment 
Next we're going to create the VPC Environment for launching the Consul server and the microservices.
You will need to use your public IP and it's CIDR set to `$ALLOWED_IP_CIDR`.
Example: `ALLOWED_IP_CIDR=$(curl -s ifconfig.me)/32`

### Create a new file `lib/environment.ts`
```ts
import * as ec2 from '@aws-cdk/aws-ec2';
import * as cdk from '@aws-cdk/core';

export class Environment extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    
    const vpc = new ec2.Vpc(this, 'ConsulAppVPC', {});    
    const securityGroup = new ec2.SecurityGroup(this, 'ConsulSecurityGroup', {
      vpc,
      description: 'Access to the ECS hosts that run containers',
    });
    securityGroup.addIngressRule(
      ec2.Peer.ipv4($ALLOWED_IP_CIDR), 
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
const environment = new Environment(app, 'ConsulEnvironment', {});
```

### Deploy the environment
```
// Make sure to set the variable $ALLOWED_IP_CIDR
cdk synth
cdk deploy
```

## Step 3: Create the Consul Server
Next we're going to create the Consul server stack. This stack will automatically configure Consul with TLS and gossip encryption. There will be two AWS Secrets Manager secrets created after successful deployment. You need to have EC2 key pair in the target region, change `$MY_KEY_NAME` with your EC2 key pair name.

### Update Environment Stack properties to be reused by other stacks
Create a new `lib/shared-props.ts` file to share the outputs across stacks
```ts
import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';

export interface EnvironmentProps extends cdk.StackProps {
  vpc: ec2.Vpc,
  securityGroup: ec2.SecurityGroup,
}
```

Update `lib/environment.ts`

```ts
// Add class variables
  public readonly props: EnvironmentProps;

// Set them in the constructor at the very end
  this.props = {
    vpc,
    securityGroup,
  };
```

### Create a new file `lib/consul-server.ts`
```ts
import * as cdk from '@aws-cdk/core';
import * as ec2 from "@aws-cdk/aws-ec2";
import * as iam from "@aws-cdk/aws-iam";
import { EnvironmentProps } from './shared-props';

export class ConsulServer extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: EnvironmentProps) {
    super(scope, id, props);
    
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
    userData.addCommands('touch user-data.txt');
    userData.addCommands(
    `# Notify CloudFormation that the instance is up and ready`,
    `yum install -y aws-cfn-bootstrap`,
    `/opt/aws/bin/cfn-signal -e $? --stack ${cdk.Stack.of(this).stackName} --resource ConsulInstance --region ${cdk.Stack.of(this).region}`);

    const consulServer = new ec2.Instance(this, 'ConsulServer', {
      vpc: props.vpc,
      securityGroup: props.securityGroup,
      instanceType: new ec2.InstanceType('t3.large'),
      machineImage: ami,
      keyName: $MY_KEY_NAME,
      role: role,
      userData: userData,
    });
  }
}
```

### Modify app entry point `bin/app.ts`
Add the following

```ts
import { ConsulServer } from '../lib/consul-server';

const server = new ConsulServer(app, 'ConsulServer', environment.props);
```

### Deploy the environment
```
// Make sure to set the variable $MY_KEY_NAME
cdk synth
cdk deploy --all
```

## Step 4: Create the sample CDK application

TBD

### Deploy the app

From your terminal, run:

```
cdk deploy
```

![AWS CDK toolkit output showing the ELB URL](imgs/cdk-output.png)

Get the ELB URL from the output and hit it on your browser to check the result

![Browser output showing the random greeting and name output](imgs/elb-output.png)

## Step 5 - Clean up

From your terminal, destroy all stacks

```
cdk destroy --all
```

## Reference

* In hurry? see the full example [here](app/)
* Check the [ECS Consul Mesh CDK repo](https://github.com/aws-ia/ecs-consul-mesh-extension)