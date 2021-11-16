import * as cdk from '@aws-cdk/core';
import * as ec2 from "@aws-cdk/aws-ec2";
import { EnvironmentProps } from './shared-props';

export class Environment extends cdk.Stack {
  public readonly props: EnvironmentProps;

  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    
    const vpc = new ec2.Vpc(this, 'ConsulVPC', {});    
    const securityGroup = new ec2.SecurityGroup(this, 'ConsulSecurityGroup', {
      vpc,
      description: 'Access to the ECS hosts that run containers',
    });
    securityGroup.addIngressRule(
      ec2.Peer.ipv4(`$ALLOWED_IP_CIDR`), 
      ec2.Port.tcp(22), 
      'Allow incoming connections for SSH over IPv4');

    this.props = {
      vpc,
      securityGroup,
    };
  }
}