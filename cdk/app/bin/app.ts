#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';

const app = new cdk.App();

import { Environment } from '../lib/environment';

// Environment
var allowedIPCidr = process.env.ALLOWED_IP_CIDR || `$ALLOWED_IP_CIDR`;
const environment = new Environment(app, 'ConsulEnvironment', {
    envName: 'test',
    allowedIpCidr: allowedIPCidr,
});

import { ConsulServer } from '../lib/consul-server';

// Consul Server
var keyName = process.env.MY_KEY_NAME || `$MY_KEY_NAME`;
const server = new ConsulServer(app, 'ConsulServer', {
    envProps: environment.props,
    keyName,
});

import { Microservices } from '../lib/microservices';

// Microservices with Consul Client
const microservices = new Microservices(app, 'ConsulMicroservices', environment.props, server.props);
