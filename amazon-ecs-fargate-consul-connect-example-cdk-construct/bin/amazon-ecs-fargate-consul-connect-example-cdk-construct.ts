#!/usr/bin/env node
import * as cdk from '@aws-cdk/core';
import { AmazonEcsFargateConsulConnectExampleCdkConstructStack } from '../lib/amazon-ecs-fargate-consul-connect-example-cdk-construct-stack';

const app = new cdk.App();
new AmazonEcsFargateConsulConnectExampleCdkConstructStack(app, 'AmazonEcsFargateConsulConnectExampleCdkConstructStack');
