var runProcessAndCapture = require('orchestration-util-process').runProcessAndCapture;
var runProcessWithOutputAndInput = require('orchestration-util-process').runProcessWithOutputAndInput;
var process = require('process');

function getDeploymentDocument(deploymentName, image, version, containerPorts, envs, replicas, hostVolumes, healthCheck) {
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
      "resources": {
        "requests": {
          "cpu": 0
        }
      },
      "env": envsBuilt,
      "volumeMounts": volumeMountsBuilt,
      "readinessProbe": {
        "httpGet": {
          "path": healthCheck.path,
          "port": healthCheck.port
        },
        "periodSeconds": 1,
        "timeoutSeconds": 1,
        "successThreshold": 1,
        "failureThreshold": 10
      }
    };
  } else {
    container = {
      "name": deploymentName,
      "image": image + ":" + version,
      "ports": containerPortsBuilt,
      "resources": {
        "requests": {
          "cpu": 0
        }
      },
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
      "replicas": replicas,
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
          "volumes": volumesBuilt
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

function createDeployment(deploymentName, image, version, containerPorts, env, replicas, hostVolumes, healthCheck, callback) {
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
    JSON.stringify(getDeploymentDocument(deploymentName, image, version, containerPorts, env, replicas, hostVolumes, healthCheck)),
    callback
  );
}

function replaceDeployment(deploymentName, image, version, containerPorts, env, replicas, hostVolumes, healthCheck, callback) {
  console.log("Updating Kubernetes deployment with new version...");
  runProcessWithOutputAndInput(
    'kubectl',
    [
      '--kubeconfig=.kube/config',
      'replace',
      'deployment',
      deploymentName,
      '-f',
      '-',
      '--record'
    ],
    JSON.stringify(getDeploymentDocument(deploymentName, image, version, containerPorts, env, replicas, hostVolumes, healthCheck)),
    callback
  );
}

function waitForDeploymentToComplete(deploymentName, image, version, callback) {
  console.log("TODO: Monitor deployment");
  callback();
}

module.exports = {
  ifDeploymentExists: ifDeploymentExists,
  createDeployment: createDeployment,
  replaceDeployment: replaceDeployment,
  waitForDeploymentToComplete: waitForDeploymentToComplete,
}