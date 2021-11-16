#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { Environment } from '../lib/environment';
import { ConsulServer } from '../lib/consul-server';
import { ServerProps } from '../lib/shared-props';
import { Microservices } from '../lib/microservices';

const app = new cdk.App();

// Environment
const environment = new Environment(app, 'ConsulEnvironment', {});

// Consul Server
const server = new ConsulServer(app, 'ConsulServer', environment.props);
const agentCASecretArn = `$CONSUL_AGENT_CA_ARN`;
const gossipKeySecretArn = `$CONSUL_GOSSIP_KEY_ARN`;
const serverProps = new ServerProps(server, agentCASecretArn, gossipKeySecretArn);

// Microservices with Consul Client
const microservices = new Microservices(app, 'ConsulMicroservices', serverProps)