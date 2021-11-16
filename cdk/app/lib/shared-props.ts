import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as secretsmanager from '@aws-cdk/aws-secretsmanager';

export interface EnvironmentProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  serverSecurityGroup: ec2.SecurityGroup;
  clientSecurityGroup: ec2.SecurityGroup;
}

export class ServerProps {
  agentCASecret: secretsmanager.ISecret;
  gossipKeySecret: secretsmanager.ISecret;

  constructor(scope: cdk.Construct, agentCASecretArn: string, gossipKeySecretArn: string) {
    this.agentCASecret = secretsmanager.Secret.fromSecretAttributes(scope, 'ImportedConsulAgentCA', {
      secretArn: agentCASecretArn
    });
    this.gossipKeySecret = secretsmanager.Secret.fromSecretAttributes(scope, 'ImportedConsulGossipKey', {
      secretArn: gossipKeySecretArn
    });
  }
}
