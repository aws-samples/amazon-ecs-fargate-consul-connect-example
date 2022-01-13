import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as ecs from '@aws-cdk/aws-ecs';
import * as consul_ecs from '@aws-quickstart/ecs-consul-mesh-extension';
import * as ecs_extensions from '@aws-cdk-containers/ecs-service-extensions';
import { EnvironmentOutputProps, ServerOutputProps } from './shared-props';

export class Microservices extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string,
    envProps:EnvironmentOutputProps, serverProps: ServerOutputProps, props?: cdk.StackProps) {
      super(scope, id, props);

      const consulServerSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(this, 'ImportedServerSG', envProps.serverSecurityGroup.securityGroupId);
      const consulClientSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(this, 'ImportedClientSG', envProps.clientSecurityGroup.securityGroupId);

      // Consul Client Base Configuration
      const retryJoin = new consul_ecs.RetryJoin({
        region: cdk.Stack.of(this).region,
        tagName: Object.keys(serverProps.serverTag)[0],
        tagValue: Object.values(serverProps.serverTag)[0]});
      const baseProps = {
        retryJoin,
        consulClientSecurityGroup: consulClientSecurityGroup,
        consulServerSecurityGroup: consulServerSecurityGroup,
        consulCACert: serverProps.agentCASecret,
        gossipEncryptKey: serverProps.gossipKeySecret,
        tls: true,
        consulDatacenter: serverProps.serverDataCenter,
        port: 3000,
        consulChecks: [
          {
            checkid  : "server-http",
            name     : "HTTP health check on port 3000",
            http     : "http://localhost:3000/health",
            method   : "GET",
            timeout  : "10s",
            interval : "2s",
          }
        ],
        healthCheck: {
          command: ["CMD-SHELL", "curl localhost:3000/health"],
          interval: cdk.Duration.seconds(30),
          retries: 3,
          timeout: cdk.Duration.seconds(5),
        }
      };

      // NAME service
      const nameDescription = new ecs_extensions.ServiceDescription();
      nameDescription.add(new ecs_extensions.Container({
        cpu: 512,
        memoryMiB: 1024,
        trafficPort: 3000,
        image: ecs.ContainerImage.fromAsset(path.resolve(__dirname, '../../../services/name/src/'), {file: 'Dockerfile'}),
      }));
      nameDescription.add(new consul_ecs.ECSConsulMeshExtension({
        ...baseProps,
        serviceDiscoveryName: 'name',
      }));      
      const name = new ecs_extensions.Service(this, 'name', {
        environment: envProps.ecsEnvironment,
        serviceDescription: nameDescription
      });

      // GREETING service
      const greetingDescription = new ecs_extensions.ServiceDescription();
      greetingDescription.add(new ecs_extensions.Container({
        cpu: 512,
        memoryMiB: 1024,
        trafficPort: 3000,
        image: ecs.ContainerImage.fromAsset(path.resolve(__dirname, '../../../services/greeting/src/'), {file: 'Dockerfile'}),
      }));
      greetingDescription.add(new consul_ecs.ECSConsulMeshExtension({
        ...baseProps,
        serviceDiscoveryName: 'greeting',
      }));      
      const greeting = new ecs_extensions.Service(this, 'greeting', {
        environment: envProps.ecsEnvironment,
        serviceDescription: greetingDescription,
      });

      // GREETER service
      const greeterDescription = new ecs_extensions.ServiceDescription();
      greeterDescription.add(new ecs_extensions.Container({
        cpu: 512,
        memoryMiB: 1024,
        trafficPort: 3000,
        image: ecs.ContainerImage.fromAsset(path.resolve(__dirname, '../../../services/greeter/src/'), {file: 'Dockerfile'}),
      }));
      greeterDescription.add(new consul_ecs.ECSConsulMeshExtension({
        ...baseProps,
        serviceDiscoveryName: 'greeter',
      }));      
      greeterDescription.add(new ecs_extensions.HttpLoadBalancerExtension());
      const greeter = new ecs_extensions.Service(this, 'greeter', {
        environment: envProps.ecsEnvironment,
        serviceDescription: greeterDescription,
      });

      // CONSUL CONNECT
      greeter.connectTo(name, { local_bind_port: 3001 });
      greeter.connectTo(greeting, { local_bind_port: 3002 });

      new cdk.CfnOutput(this, 'ConsulClientSG', {
        value: envProps.clientSecurityGroup.securityGroupId,
        description: 'Consul Client SG',
      });
  }
}
