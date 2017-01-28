var runProcessAndCapture = require('orchestration-util-process').runProcessAndCapture;
var runProcessWithOutputAndInput = require('orchestration-util-process').runProcessWithOutputAndInput;
var process = require('process');
var spawn = require('child_process').spawn;

function getDeploymentDocument(deploymentName, image, version, containerPorts, envs, replicas, hostVolumes, healthCheck, nodeSelector, resourcesIn) {
  var containerPortsBuilt = [];
  for (var i = 0; i < containerPorts.length; i++) {
    if (containerPorts[i].type === 'HostPort') {
      containerPortsBuilt.push({
        "containerPort": containerPorts[i].containerPort,
        "hostPort": containerPorts[i].hostPort,
        "protocol": containerPorts[i].protocol,
        "name": containerPorts[i].name
      });
    } else {
      containerPortsBuilt.push({
        "containerPort": containerPorts[i].containerPort
      });
    }
  }

  var resources = resourcesIn || {};

  var envsBuilt = [];
  if (envs != null) {
    for (var key in envs) {
      if (envs.hasOwnProperty(key)) {
        envsBuilt.push({
          "name": key,
          "value": envs[key]
        });
      }
    }
  }

  if (replicas == null) {
    replicas = 2;
  }

  var volumeMountsBuilt = [];
  var volumesBuilt = [];
  if (hostVolumes != null) {
    for (var i = 0; i < hostVolumes.length; i++) {
      volumeMountsBuilt.push({
        "mountPath": hostVolumes[i].target,
        "name": hostVolumes[i].name
      });
      volumesBuilt.push({
        "name": hostVolumes[i].name,
        "hostPath": {
          "path": hostVolumes[i].source
        }
      });
    }
  }

  var container = null;
  if (healthCheck != null) {
    console.log('using health check')
    console.log(healthCheck);
    container = {
      "name": deploymentName,
      "image": image + ":" + version,
      "ports": containerPortsBuilt,
      "resources": resources,
      "env": envsBuilt,
      "volumeMounts": volumeMountsBuilt,
      "readinessProbe": healthCheck
    };
  } else {
    container = {
      "name": deploymentName,
      "image": image + ":" + version,
      "ports": containerPortsBuilt,
      "resources": resources,
      "env": envsBuilt,
      "volumeMounts": volumeMountsBuilt
    }; 
  }

  return {
    "apiVersion": "extensions/v1beta1",
    "kind": "Deployment",
    "metadata": {
      "name": deploymentName
    },
    "spec": {
      "strategy": {
        "type": "RollingUpdate",
        "rollingUpdate": {
          "maxUnavailable": 0,
          "maxSurge": 1
        }
      },
      "replicas": replicas,
      "minReadySeconds": 60,
      "template": {
        "metadata": {
          "labels": {
            "app": deploymentName
          }
        },
        "spec": {
          "containers": [
            container
          ],
          "volumes": volumesBuilt,
          "nodeSelector": (nodeSelector || {})
        }
      }
    }
  }
}

function ifDeploymentExists(deploymentName, onExistsCallback, onNotExistsCallback, onErrorCallback) {
  console.log("Checking if deployment exists...");
  runProcessAndCapture(
    'kubectl',
    [
      '--kubeconfig=.kube/config',
      '--output',
      'json',
      'get',
      'deployments'
    ],
    function(output, err) {
      if (err) { onErrorCallback(err); return; }

      var data = JSON.parse(output);

      for (var i = 0; i < data.items.length; i++) {
        if (data.items[i].metadata.name == deploymentName) {
          console.log("Found target deployment.");
          onExistsCallback();
          return;
        }
      }

      console.log("Target deployment is missing.");
      onNotExistsCallback();
    }
  )
}

function createDeployment(deploymentName, image, version, containerPorts, env, replicas, hostVolumes, healthCheck, nodeSelector, resources, callback) {
  console.log("Creating Kubernetes deployment for container...");
  runProcessWithOutputAndInput(
    'kubectl',
    [
      '--kubeconfig=.kube/config',
      'create',
      '-f',
      '-',
      '--record',
    ],
    JSON.stringify(getDeploymentDocument(deploymentName, image, version, containerPorts, env, replicas, hostVolumes, healthCheck, nodeSelector, resources)),
    callback
  );
}

function replaceDeployment(deploymentName, image, version, containerPorts, env, replicas, hostVolumes, healthCheck, nodeSelector, resources, callback) {
  console.log("Updating Kubernetes deployment with new version...");
  runProcessWithOutputAndInput(
    'kubectl',
    [
      '--kubeconfig=.kube/config',
      'apply',
      '-f',
      '-',
      '--record'
    ],
    JSON.stringify(getDeploymentDocument(deploymentName, image, version, containerPorts, env, replicas, hostVolumes, healthCheck, nodeSelector, resources)),
    callback
  );
}

function waitForDeploymentToComplete(deploymentName, version, callback) {
  var checkIfDeploymentComplete = null;
  var checks = 0;
  checkIfDeploymentComplete = () => {
    runProcessAndCapture(
      'kubectl',
      [
        '--kubeconfig=.kube/config',
        '--output',
        'json',
        'get',
        'deployment',
        deploymentName
      ],
      function(output, err) {
        if (err) { callback(err); return; }

        checks++;

        var data = JSON.parse(output);

        if (data.status.unavailableReplicas === null ||
            data.status.unavailableReplicas === undefined ||
            data.status.unavailableReplicas === 0) {
          // Rollout is complete.
          console.log('Deployment rollout is complete!');
          callback();
        } else {
          if (checks >= 120) {
            // Timed out after 20 minutes
            callback(new Error('Deployment timed out after 20 minutes'));
          } else {
            // Rollout is not complete.
            console.log('Deployment still has unavailableReplicas != 0');
            setTimeout(checkIfDeploymentComplete, 10000);
          }
        }
      }
    );
  }
  checkIfDeploymentComplete();
}

module.exports = {
  ifDeploymentExists: ifDeploymentExists,
  createDeployment: createDeployment,
  replaceDeployment: replaceDeployment,
  waitForDeploymentToComplete: waitForDeploymentToComplete,
}