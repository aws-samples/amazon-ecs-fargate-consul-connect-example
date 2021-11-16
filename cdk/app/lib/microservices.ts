import * as cdk from '@aws-cdk/core';
import * as ecs from '@aws-cdk/aws-ecs';
import * as consul_ecs from '@aws-quickstart/ecs-consul-mesh-extension';
import * as ecs_extensions from "@aws-cdk-containers/ecs-service-extensions";
import { EnvironmentOutputProps, ServerOutputProps } from './shared-props';

export class Microservices extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, envProps:EnvironmentOutputProps, serverProps: ServerOutputProps) {
      super(scope, id, {});

      // Consul Client Base Configuration
      const retryJoin = new consul_ecs.RetryJoin({ 
        region: cdk.Stack.of(this).region, 
        tagName: serverProps.serverTag.key, 
        tagValue: serverProps.serverTag.tagValue});
      const baseProps = {      
        retryJoin,
        consulClientSecurityGroup: envProps.clientSecurityGroup,
        consulServerSecurityGroup: envProps.serverSecurityGroup,
        consulCACert: serverProps.agentCASecret,
        gossipEncryptKey: serverProps.gossipKeySecret,
        tls: true,
        consulDatacenter: serverProps.serverDataCenter,
      };

      // NAME service
      const nameDescription = new ecs_extensions.ServiceDescription();
      nameDescription.add(new ecs_extensions.Container({
        cpu: 1024,
        memoryMiB: 2048,
        trafficPort: 3000,
        image: ecs.ContainerImage.fromRegistry('nathanpeck/name')
      }));
      nameDescription.add(new consul_ecs.ECSConsulMeshExtension({
        ...baseProps,
        serviceDiscoveryName: 'name',
      }));
      nameDescription.add(new ecs_extensions.AssignPublicIpExtension());
      const name = new ecs_extensions.Service(this, 'name', {
        environment: envProps.ecsEnvironment,
        serviceDescription: nameDescription
      });

      // GREETING service
      const greetingDescription = new ecs_extensions.ServiceDescription();
      greetingDescription.add(new ecs_extensions.Container({
        cpu: 1024,
        memoryMiB: 2048,
        trafficPort: 3000,
        image: ecs.ContainerImage.fromRegistry('nathanpeck/greeting')
      }));
      greetingDescription.add(new consul_ecs.ECSConsulMeshExtension({
        ...baseProps,
        serviceDiscoveryName: 'greeting',
      }));
      greetingDescription.add(new ecs_extensions.AssignPublicIpExtension());
      const greeting = new ecs_extensions.Service(this, 'greeting', {
        environment: envProps.ecsEnvironment,
        serviceDescription: greetingDescription,
      });

      // GREETER service
      const greeterDescription = new ecs_extensions.ServiceDescription();
      greeterDescription.add(new ecs_extensions.Container({
        cpu: 1024,
        memoryMiB: 2048,
        trafficPort: 3000,
        image: ecs.ContainerImage.fromRegistry('nathanpeck/greeter'),
      }));
      greeterDescription.add(new consul_ecs.ECSConsulMeshExtension({
        ...baseProps,
        serviceDiscoveryName: 'greeter',
      }));
      greeterDescription.add(new ecs_extensions.AssignPublicIpExtension());
      greeterDescription.add(new ecs_extensions.HttpLoadBalancerExtension());
      const greeter = new ecs_extensions.Service(this, 'greeter', {
        environment: envProps.ecsEnvironment,
        serviceDescription: greeterDescription,
      });

      // CONSUL CONNECT
      greeter.connectTo(name, 3000);
      greeter.connectTo(greeting, 3001);
  }
}