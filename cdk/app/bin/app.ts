#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { Environment } from '../lib/environment';
import { ConsulServer } from '../lib/consul-server';

const app = new cdk.App();
const environment = new Environment(app, 'ConsulEnvironment', {});
const server = new ConsulServer(app, 'ConsulServer', environment.props);
