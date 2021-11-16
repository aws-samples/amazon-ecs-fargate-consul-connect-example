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
      keyName: `$MY_KEY_NAME`,
      role: role,
      userData: userData,
    });
  }
}