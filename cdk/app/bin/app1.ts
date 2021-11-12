#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { App1Stack } from '../lib/app1-stack';

const env = { account: '$AWS_ACCOUNT_ID', region: '$AWS_REGION' };

const app = new cdk.App();
new App1Stack(app, 'App1Stack', {env: env});