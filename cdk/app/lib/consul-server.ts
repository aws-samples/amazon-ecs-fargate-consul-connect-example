import * as cdk from '@aws-cdk/core';
import * as ec2 from "@aws-cdk/aws-ec2";
import * as iam from "@aws-cdk/aws-iam";
import { ServerInputProps } from './shared-props';

export class ConsulServer extends cdk.Stack {
  public readonly serverTag: {[key:string]: string};

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
    userData.addCommands('touch user-data.txt');
    userData.addCommands(
    `# Notify CloudFormation that the instance is up and ready`,
    `yum install -y aws-cfn-bootstrap`,
    `/opt/aws/bin/cfn-signal -e $? --stack ${cdk.Stack.of(this).stackName} --resource ConsulInstance --region ${cdk.Stack.of(this).region}`);

    const vpc = inputProps.envProps.vpc;
    const consulServer = new ec2.Instance(this, 'ConsulServer', {
      vpc: vpc,
      securityGroup: inputProps.envProps.serverSecurityGroup,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3,ec2.InstanceSize.LARGE),
      machineImage: ami,
      keyName: inputProps.keyName,
      role: role,
      userData: userData,
    });
    
    const tagName = 'Name'
    const tagValue = inputProps.envProps.envName + '-consul-server';
    cdk.Tags.of(scope).add(tagName, tagValue);
    const serverTag = { tagName: tagValue };
    this.serverTag = serverTag;
  }
}