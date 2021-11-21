import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as extensions from "@aws-cdk-containers/ecs-service-extensions";
import * as secretsmanager from '@aws-cdk/aws-secretsmanager';

export interface EnvironmentInputProps extends cdk.StackProps {
  envName: string;
  allowedIpCidr: string;
}

export interface EnvironmentOutputProps extends cdk.StackProps {
  envName: string;
  vpc: ec2.Vpc;
  serverSecurityGroup: ec2.SecurityGroup;
  clientSecurityGroup: ec2.SecurityGroup;
  ecsEnvironment: extensions.Environment;
}

export interface ServerInputProps extends cdk.StackProps {
  envProps: EnvironmentOutputProps,
  keyName: string,
}

export interface ServerOutputProps extends cdk.StackProps {
  serverTag: {[key: string]: string};
  serverDataCenter: string;
  agentCASecret: secretsmanager.ISecret;
  gossipKeySecret: secretsmanager.ISecret;
}