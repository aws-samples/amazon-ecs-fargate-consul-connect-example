#!/bin/sh

SERVICE_NAME="name"         # the service name as it will appear in Consul
ENV_NAME="test"       # the 'EnvironmentName' of the Consul service mesh to join
CONSUL_DIR="/consul/config" # the directory where Consul expects to find conifg files

# discover other required values from the Amazon ECS metadata endpoint
ECS_IPV4=$(curl -s $ECS_CONTAINER_METADATA_URI | jq '.Networks[0].IPv4Addresses[0]')
echo "discovered IPv4 address is: " $ECS_IPV4

TASK_ARN=$(curl -s $ECS_CONTAINER_METADATA_URI | jq '.Labels["com.amazonaws.ecs.task-arn"]')
echo "discovered task ARN is: " $TASK_ARN

# extract AWS region and task ID from task ARN
TASK_ID=$(echo $TASK_ARN | awk -F'/' '{gsub("\"","",$NF)};{print $NF}')

# build unique node name for the Consul agent
# NOTE: current $AWS_REGION available within FARGATE tasks
node_UUID=$SERVICE_NAME-$AWS_REGION-$TASK_ID

echo "writing service file..."
echo '{
    "service": {
        "name": "'$SERVICE_NAME'",
        "port": 3000,
        "connect": { 
            "sidecar_service": {
                "port": 8080
            } 
        }
    }
}' >> ${CONSUL_DIR}/service-${SERVICE_NAME}.json

# Currently need to specify a region for auto-join to work on Amazon ECS
# See: https://github.com/hashicorp/go-discover/issues/61
echo "writing config file..."
echo '{
    "node_name": "'$node_UUID'",
    "client_addr": "0.0.0.0",
    "data_dir": "/consul/data",
    "retry_join": ["provider=aws region='$AWS_REGION' tag_key=Name tag_value='$ENV_NAME'-consul-server"],
    "advertise_addr":' $ECS_IPV4 '
}' >> ${CONSUL_DIR}/config.json


echo "contents of $CONSUL_DIR is:"
ls ${CONSUL_DIR}

echo "reading service file..."
cat ${CONSUL_DIR}/service-${SERVICE_NAME}.json

echo "reading config file..."
cat ${CONSUL_DIR}/config.json

echo "starting Consul agent..."
exec consul agent -ui -config-dir ${CONSUL_DIR}