import * as cdk from '@aws-cdk/core';
import { ServerProps } from './shared-props';

export class Microservices extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: ServerProps) {
      super(scope, id, {});
  }
}