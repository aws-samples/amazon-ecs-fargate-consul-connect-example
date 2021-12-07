import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as ecs from '@aws-cdk/aws-ecs';
import * as extensions from '@aws-cdk-containers/ecs-service-extensions';
import { EnvironmentInputProps, EnvironmentOutputProps } from './shared-props';

export class Environment extends cdk.Stack {
  public readonly props: EnvironmentOutputProps;

  constructor(scope: cdk.Construct, id: string, inputProps: EnvironmentInputProps) {
    super(scope, id, inputProps);

    const vpc = new ec2.Vpc(this, 'ConsulVPC', {
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'PublicSubnet',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'PrivateSubnet',
          subnetType: ec2.SubnetType.PRIVATE_WITH_NAT,
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
  }
}