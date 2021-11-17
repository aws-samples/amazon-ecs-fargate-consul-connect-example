#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { Environment } from '../lib/environment';
import { ConsulServer } from '../lib/consul-server';
import { ServerOutputProps } from '../lib/shared-props';
import { Microservices } from '../lib/microservices';

const app = new cdk.App();
const env = { account: '$AWS_ACCOUNT_ID', region: '$AWS_REGION' };

// Environment
var allowedIPCidr = process.env.ALLOWED_IP_CIDR || `$ALLOWED_IP_CIDR`;
const environment = new Environment(app, 'ConsulEnvironment', {
    envName: 'test',
    allowedIpCidr: allowedIPCidr,
    env,
});

// Consul Server
var keyName = process.env.MY_KEY_NAME || `$MY_KEY_NAME`;
const server = new ConsulServer(app, 'ConsulServer', {
    envProps: environment.props,
    keyName,
    env,
});
var agentCASecretArn = process.env.CONSUL_AGENT_CA_ARN || `$CONSUL_AGENT_CA_ARN`;
var gossipKeySecretArn= process.env.CONSUL_GOSSIP_KEY_ARN || `$CONSUL_GOSSIP_KEY_ARN`;
const serverProps = new ServerOutputProps(server, agentCASecretArn, gossipKeySecretArn);

// Microservices with Consul Client
const microservices = new Microservices(app, 'ConsulMicroservices', 
    environment.props, serverProps, {env: env}
);
