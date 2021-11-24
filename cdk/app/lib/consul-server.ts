import * as fs from 'fs';
import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as iam from '@aws-cdk/aws-iam';
import * as secretsmanager from '@aws-cdk/aws-secretsmanager';
import { ServerInputProps, ServerOutputProps } from './shared-props';

export class ConsulServer extends cdk.Stack {
  public readonly props: ServerOutputProps;

  constructor(scope: cdk.Construct, id: string, inputProps: ServerInputProps) {
    super(scope, id, inputProps);

    const ami = new ec2.AmazonLinuxImage({
      generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
    });

    const agentCASecret = new secretsmanager.Secret(this, 'agentCASecret', {
      description: 'Consul TLS encryption CA public key'
    });

    const gossipKeySecret = new secretsmanager.Secret(this, 'gossipKeySecret', {
      description: 'Consul gossip encryption key'
    });

    // Role to allow Consul server to write to secrets manager
    const role = new iam.Role(this, 'ConsulSecretManagerRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
    });
    role.addToPolicy(new iam.PolicyStatement({
      actions: ['secretsmanager:UpdateSecret'],
      resources: [agentCASecret.secretArn, gossipKeySecret.secretArn],
    }));

    const userData = ec2.UserData.forLinux();
    const userDataScript = fs.readFileSync('./lib/user-data.txt', 'utf8');
    const consulInstanceName = 'ConsulInstance';

    userData.addCommands('export CONSUL_CA_SECRET_ARN='+ agentCASecret.secretArn)
    userData.addCommands('export CONSUL_GOSSIP_SECRET_ARN='+ gossipKeySecret.secretArn)
    userData.addCommands(userDataScript);
    userData.addCommands(
    `# Notify CloudFormation that the instance is up and ready`,
    `yum install -y aws-cfn-bootstrap`,
    `/opt/aws/bin/cfn-signal -e $? --stack ${cdk.Stack.of(this).stackName} --resource ${consulInstanceName} --region ${cdk.Stack.of(this).region}`);

    const vpc = inputProps.envProps.vpc;

    // This setup is just for a test environment
    const consulServer = new ec2.Instance(this, consulInstanceName, {
      vpc: vpc,
      securityGroup: inputProps.envProps.serverSecurityGroup,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3,ec2.InstanceSize.LARGE),
      machineImage: ami,
      keyName: inputProps.keyName,
      role: role,
      userData: userData,
      resourceSignalTimeout: cdk.Duration.minutes(5)
    });
    var cfnInstance = consulServer.node.defaultChild as ec2.CfnInstance
    cfnInstance.overrideLogicalId(consulInstanceName);

    const serverDataCenter = 'dc1';
    const tagName = 'Name'
    const tagValue = inputProps.envProps.envName + '-consul-server';
    cdk.Tags.of(consulServer).add(tagName, tagValue);
    const serverTag = { [tagName]: tagValue };

    new cdk.CfnOutput(this, 'ConsulSshTunnel', {
      value: `ssh -i "~/.ssh/`+ inputProps.keyName + `.pem" ` +
       `-L 127.0.0.1:8500:` + consulServer.instancePublicDnsName + `:8500 ` +
       `ec2-user@` + consulServer.instancePublicDnsName,
      description: 'Command to run to open a local SSH tunnel to view the Consul dashboard',
    });

    this.props = {
      serverTag,
      serverDataCenter,
      agentCASecret,
      gossipKeySecret
    };
  }
}
