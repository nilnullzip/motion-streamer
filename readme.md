Capture accelerometer samples and save to MongoDB
-------------------------------------------------
##### Juan Pineda nilnullzip @ GitHub

Based on HTML5 accelerometer interface and Meteor web framework.

### Quick start

    # install meteor
    curl https://install.meteor.com | /bin/sh
    
    # install metorite
    npm install -g meteorite
    
    # clone acc-meteor
    git clone git@github.com:nilnullzip/acc-meteor.git

    # install required meteorite packages    
    cd acc-meteor
    mrt install

    # run local Meteor server
    meteor

At this point the app server will be running on your dev machine. Open the app page at: http://localhost:3000/ and log in. Then open the app page from your mobile phone (subsituting your dev machine's IP address for 'localhost') and log in using the same username. Follow directions in the app and have fun!

### Access the database

The locally maintained database can be accessed on port 3001

    $ mongo --port 3001
    > use meteor
    > db.samples.count()
    > db.samples.find()

### Convert to native mobile app

Phonegap/cordova can be used to convert the client to a mobile app. The following (really cool) script will convert a deployed meteor app to a phonegap app that can then be targetted and compiled for Android and IOS:

> https://github.com/guaka/meteor-phonegap
