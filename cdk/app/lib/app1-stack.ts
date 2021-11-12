import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as ecs from '@aws-cdk/aws-ecs';
import * as secretsmanager from '@aws-cdk/aws-secretsmanager';
import { AssignPublicIpExtension, Container, Environment, Service, ServiceDescription, HttpLoadBalancerExtension } from '@aws-cdk-containers/ecs-service-extensions';
import { ECSConsulMeshExtension, RetryJoin } from '@aws-quickstart/ecs-consul-mesh-extension';

export class App1Stack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    //change with your vpc id
    const vpc = ec2.Vpc.fromLookup(this, 'consulVPC', { vpcId: '$MY_VPC_ID', region: '$AWS_REGION' })

    const environment = new Environment(this, 'demo', {
      vpc: vpc
    });

    //change to your Consul server security group id    
    const consulServerSecurityGroup = ec2.SecurityGroup.fromLookup(this, 'consulServerSecurityGroup', '$CONSUL_SG')
 
    const consulClientSecurityGroup = new ec2.SecurityGroup(this, 'consulClientSecurityGroup', {
      vpc: environment.vpc
    });
    
    consulClientSecurityGroup.addIngressRule(
      consulClientSecurityGroup,
      ec2.Port.tcp(8301),
      'allow all the clients in the mesh talk to each other'
    );

    consulClientSecurityGroup.addIngressRule(
      consulClientSecurityGroup,
      ec2.Port.udp(8301),
      'allow all the clients in the mesh talk to each other'
    )

    // change to your secrets manager ARN
    const agentCASecret = secretsmanager.Secret.fromSecretAttributes(this, 'ImportedSecret', {
        secretArn: '$CONSUL_AGENT_CA'
      });
   
    const gossipSecret = secretsmanager.Secret.fromSecretAttributes(this, 'ImportedGossipSecret', {
        secretArn: '$CONSUL_GOSSIP',
    });

    // NAME service
    const nameDescription = new ServiceDescription();
    nameDescription.add(new Container({
      cpu: 1024,
      memoryMiB: 2048,
      trafficPort: 3000,
      image: ecs.ContainerImage.fromRegistry('nathanpeck/name')
    }));
 
    nameDescription.add(new ECSConsulMeshExtension({      
      retryJoin: new RetryJoin({ region: '$AWS_REGION', tagName: 'Name', tagValue: 'test-consul-server' }),
      port: 3000,
      consulClientSecurityGroup: consulClientSecurityGroup,
      consulServerSecurityGroup: consulServerSecurityGroup,
      consulCACert: agentCASecret,
      gossipEncryptKey: gossipSecret,
      tls: true,
      serviceDiscoveryName: 'name',
      consulDatacenter: 'dc1',
    }));

    nameDescription.add(new AssignPublicIpExtension());
    
    const name = new Service(this, 'name', {
      environment: environment,
      serviceDescription: nameDescription
    });

    // GREETING service
    const greetingDescription = new ServiceDescription();
    
    greetingDescription.add(new Container({
      cpu: 1024,
      memoryMiB: 2048,
      trafficPort: 3000,
      image: ecs.ContainerImage.fromRegistry('nathanpeck/greeting')
    }));

    greetingDescription.add(new ECSConsulMeshExtension({
      retryJoin: new RetryJoin({ region: '$AWS_REGION', tagName: 'Name', tagValue: 'test-consul-server' }),
      port: 3000,
      consulClientSecurityGroup: consulClientSecurityGroup,
      consulServerSecurityGroup: consulServerSecurityGroup,
      consulCACert: agentCASecret,
      gossipEncryptKey: gossipSecret,
      tls: true,
      serviceDiscoveryName: 'greeting',
      consulDatacenter: 'dc1',
    }));

    greetingDescription.add(new AssignPublicIpExtension());
    
    const greeting = new Service(this, 'greeting', {
      environment: environment,
      serviceDescription: greetingDescription,
    });

    // GREETER service
    const greeterDescription = new ServiceDescription();
    
    greeterDescription.add(new Container({
      cpu: 1024,
      memoryMiB: 2048,
      trafficPort: 3000,
      image: ecs.ContainerImage.fromRegistry('nathanpeck/greeter'),
    }));

    greeterDescription.add(new ECSConsulMeshExtension({
      retryJoin: new RetryJoin({ region: '$AWS_REGION', tagName: 'Name', tagValue: 'test-consul-server' }),
      port: 3000,
      consulClientSecurityGroup: consulClientSecurityGroup,
      consulServerSecurityGroup: consulServerSecurityGroup,
      consulCACert: agentCASecret,
      gossipEncryptKey: gossipSecret,
      tls: true,
      serviceDiscoveryName: 'greeter',
      consulDatacenter: 'dc1',
    }));

    greeterDescription.add(new AssignPublicIpExtension());
    greeterDescription.add(new HttpLoadBalancerExtension());
    
    const greeter = new Service(this, 'greeter', {
      environment: environment,
      serviceDescription: greeterDescription,
    });

    greeter.connectTo(name);
    greeter.connectTo(greeting);

  }
}