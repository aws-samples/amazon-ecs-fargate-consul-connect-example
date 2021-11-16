import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';

export interface EnvironmentProps extends cdk.StackProps {
  vpc: ec2.Vpc,
  securityGroup: ec2.SecurityGroup,
}
