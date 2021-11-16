import * as cdk from '@aws-cdk/core';
import * as ec2 from "@aws-cdk/aws-ec2";
import { EnvironmentProps } from './shared-props';

export class Environment extends cdk.Stack {
  public readonly props: EnvironmentProps;

  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    
    const vpc = new ec2.Vpc(this, 'ConsulVPC', {});    
    const serverSecurityGroup = new ec2.SecurityGroup(this, 'ConsulServerSecurityGroup', {
      vpc,
      description: 'Access to the ECS hosts that run containers',
    });
    serverSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(`$ALLOWED_IP_CIDR`), 
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
    )

    this.props = {
      vpc,
      serverSecurityGroup,
      clientSecurityGroup
    };
  }
}