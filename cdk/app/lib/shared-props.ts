import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as secretsmanager from '@aws-cdk/aws-secretsmanager';
import { ConsulServer } from './consul-server';

export interface EnvironmentInputProps extends cdk.StackProps {
  envName: string;
  allowedIpCidr: string;
}

export interface EnvironmentOutputProps extends cdk.StackProps {
  envName: string;
  vpc: ec2.Vpc;
  serverSecurityGroup: ec2.SecurityGroup;
  clientSecurityGroup: ec2.SecurityGroup;
}

export interface ServerInputProps extends cdk.StackProps {
  envProps: EnvironmentOutputProps,
  keyName: string,
}

export class ServerOutputProps {
  serverTag: {[key: string]: string};
  agentCASecret: secretsmanager.ISecret;
  gossipKeySecret: secretsmanager.ISecret;

  constructor(serverScope: ConsulServer, agentCASecretArn: string, gossipKeySecretArn: string) {
    this.serverTag = serverScope.serverTag;
    this.agentCASecret = secretsmanager.Secret.fromSecretAttributes(serverScope, 'ImportedConsulAgentCA', {
      secretArn: agentCASecretArn
    });
    this.gossipKeySecret = secretsmanager.Secret.fromSecretAttributes(serverScope, 'ImportedConsulGossipKey', {
      secretArn: gossipKeySecretArn
    });
  }
}
