import * as cdk from '@aws-cdk/core';
import { ServerOutputProps } from './shared-props';

export class Microservices extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: ServerOutputProps) {
      super(scope, id, {});

      // Consul Client Configuration
  }
}