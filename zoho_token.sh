#!/bin/bash
curl -X POST "https://accounts.zoho.com/oauth/v2/token" -d "grant_type=authorization_code&client_id=$1&client_secret=$2&redirect_uri=https://zohoapis.com&code=$3"
