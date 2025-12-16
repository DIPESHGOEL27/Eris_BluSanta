#!/bin/bash

# The name of docker image
dckr_img=video-stitch

ip=0.0.0.0
port=8080
cnt_name="vs_cnt"

#base_img=us-central1-docker.pkg.dev/vision-393814/unai-base-images/tts-cpu-base:async-latest
base_img=us-central1-docker.pkg.dev/sage-shard-448708-v9/inference/ffmpeg-server-base:latest

if [[ $1 == "build" ]]
then
    # gcloud auth configure-docker us-central1-docker.pkg.dev
    # aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 880790178319.dkr.ecr.us-east-1.amazonaws.com
    gcloud auth configure-docker us-central1-docker.pkg.dev
    docker pull $base_img
    # Build the docker image locally 
    docker build . -t ${dckr_img} --build-arg BASE_IMG=$base_img

elif [[ $1 == "run" ]]
then
    docker run --restart=always -d --name $cnt_name -p $ip:$port:8080 $dckr_img serve
    docker ps

elif [[ $1 == "both" ]]
then
    bash build_and_run.sh build
    bash build_and_run.sh run
elif [[ $1 == "stop" ]]
then
    dd=`date "+%F-%T"`
    id=`docker container ls --all --quiet --no-trunc --filter "name=$cnt_name"`
    sudo cp /var/lib/docker/containers/$id/$id-json.log /home/ubuntu/logs/$cnt_name-$dd-$id.log
    docker stop $cnt_name
    docker rm $cnt_name

elif [[ $1 == "destroy" ]]
then
    docker stop $cnt_name
    docker rm $cnt_name
    docker image rm -f $dckr_img
fi



