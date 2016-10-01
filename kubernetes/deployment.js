var runProcessAndCapture = require('orchestration-util-process').runProcessAndCapture;
var runProcessWithOutputAndInput = require('orchestration-util-process').runProcessWithOutputAndInput;
var process = require('process');

function getDeploymentDocument(deploymentName, image, version, containerPorts, healthCheck) {
  var containerPortsBuilt = [];
  for (var i = 0; i < containerPorts.length; i++) {
    containerPortsBuilt.push({
      "containerPort": containerPorts[i]
    });
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
      }
    }; 
  }

  return {
    "apiVersion": "extensions/v1beta1",
    "kind": "Deployment",
    "metadata": {
      "name": deploymentName
    },
    "spec": {
      "replicas": 2,
      "template": {
        "metadata": {
          "labels": {
            "app": deploymentName
          }
        },
        "spec": {
          "containers": [
            container
          ]
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

function createDeployment(deploymentName, image, version, containerPorts, healthCheck, callback) {
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
    JSON.stringify(getDeploymentDocument(deploymentName, image, version, containerPorts, healthCheck)),
    callback
  );
}

function replaceDeployment(deploymentName, image, version, containerPorts, healthCheck, callback) {
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
    JSON.stringify(getDeploymentDocument(deploymentName, image, version, containerPorts, healthCheck)),
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