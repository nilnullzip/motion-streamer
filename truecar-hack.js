// Collect accelerometer samples and save to MongoDB collection named "samples".

Samples = new Meteor.Collection("samples"); // Get/create MongoDB collection

if (Meteor.isClient) {

  var user_filter = function () {
    username = Session.get("username")
    if (username == undefined) {
      username = ""
    }
    if (username=="ALL") {
      filter = {}
    } else {
      filter = {username: username}      
    }
    return filter;
  }

//  Handlebars.registerHelper('sessionvar',function(input){
//    return "var=" + Session.get(input);
//  });

  Template.body.activetab = function (t) {
    return (t == Session.get("tabs")) || (t == "#review" && !Session.get("tabs"));
  }

  Template.body.username = function (t) {
    return Session.get("username");
  }

  Template.body.has_username = function (t) {
    console.log("has_username: " + Session.get("username"));
    var u = Session.get("username");
    return u != "" && u != undefined;
  }

  Template.body.events({
    'click button#startstop': function () {
      if ($("#startstop").text() == "Record") {
        $("#startstop").text("Stop")
      } else {
        $("#startstop").text("Record")
      }
    },
    'click button#clear': function () {
      var filter = user_filter();
      console.log("Clearing samples for user: " + Session.get("username"))
      if (filter.username == undefined && !confirm("Really?")) {
        console.log("Clearing cancelled.")
        return;
      }
      Samples.find(filter).forEach(function(d){Samples.remove(d._id)});
      console.log("Cleared samples for user: " + Session.get("username"))
    }
  });

  $(window).bind('hashchange', function() {
    console.log("hashchange: " + location.hash);
    Session.set("tabs", location.hash);
  });

  $(window).bind('popstate', function() {
    console.log("popstate: " + location.hash);
    Session.set("tabs", location.hash);
  });

  Template.tabs.rendered = function () {
    console.log("Template.tabs.rendered.")

    // Trigger when tab changes

    $('#maintabs a[data-toggle="tab"]').on('shown.bs.tab', function (e) {
      console.log("BS: " + e.target.hash);
      Session.set("tabs", e.target.hash);
//      console.log("BS: " + location.hash);
//      Session.set("tabs", location.hash);
    });

    // Initialize the tab

    if (Session.get("tabs")) {
      //console.log("Template.tabs.rendered: tabs=" + Session.get("tabs"))
      //$('#maintabs #' + Session.get("tabs")).tab("show");
      $('#maintabs ' + Session.get("tabs") + "tab").tab("show");
    } else {
      $('#maintabs a[data-toggle="tab"]:first').tab("show");
    }

  }
 
  // Recent samples display

  Template.body.recentsamples = function () {
    var s = Samples.findOne(user_filter(), {sort: {created_at: -1}});
    if (s != null) {
      return _.map(s["samples"], JSON.stringify );
    } else {
      return [];
    }
  };

  // Live display of number of samples

  Template.nsamples.nsamples = function () {
    return Samples.find(user_filter()).count();
  };

  Template.nsamples.events({
  });

  Template.username.events({
    'keyup input#username': function () {
      Session.set("username", $("#username").val());
    }
  });

  var motion_event;

  // At startup set up device motion event handler.

  Meteor.startup(function () {

    Session.set("radio_value", $("input:radio[name=display]:checked").val())
    var timestamp = 0;
    var samples = [];

    if (window.DeviceMotionEvent != undefined) {

      // Device motion event service routine!
            
      window.ondevicemotion = function(e) {

        motion_event = e;

        var s = "";

        //if ($("#startstop").text() != "Stop" || Session.get("tabs") != "collecttab") {
        // Measure sample interval and siplay on page

        var t = Date.now();
        s += "measured sample period: " + (t - timestamp) + " ms<br>";
        s += "API sample period: " + Math.floor(e.interval*1000) + " ms<br><br>";
        timestamp = t

        // Create the sample

        var sample = {}
        sample.x = e.accelerationIncludingGravity.x;
        sample.y = e.accelerationIncludingGravity.y;
        sample.z = e.accelerationIncludingGravity.z;
        if ( e.rotationRate ) {
          sample.a = e.rotationRate.alpha;
          sample.b = e.rotationRate.beta;
          sample.c = e.rotationRate.gamma;
        }
        sample.t = t;

        // Live update (Only when not recording)

        if ($("#startstop").text() != "Stop" || Session.get("tabs") != "#collect") {
          samples = [];
          if ($("#startstop").text() == "Record") {
            s += "accx: " + sample.x + "<br/>";
            s += "accy: " + sample.y + "<br/>";
            s += "accz: " + sample.z + "<br/>";
            if ( e.rotationRate ) {
              s += "rota: " + sample.a + "<br/>";
              s += "rota: " + sample.b + "<br/>";
              s += "rota: " + sample.b + "<br/>";
            }
          }
          $("#accxyz").html(s);
          return;
        }
        $("#accxyz").html("");

        // Every 20 samples save record in mongoDB.

        samples.push(sample);
        if (samples.length > 20) {
          created_at = new Date().getTime();
          username = $("#username").val();
          Samples.insert({samples: samples, created_at: created_at, username: username});
          samples = [];
        }
      }
    }
  });
}

if (Meteor.isServer) {
  Meteor.startup(function () {
    // Stuff to run at startup on server goes here.
  });
}

// Server routes

Router.configure({
  notFoundTemplate: 'notFound' // this will render
});

Router.map(function () {
  this.route('body', {
    path: '/'
  });
});

Router.map(function () {
  this.route('json', {
    where: 'server',
    path: '/json/:username',

    action: function () {
      var username = this.params.username;
      console.log("JSON: username: " + username);
      console.log("JSON: n: " + this.params.n);
      var filter = {}

      if (username != "ALL") {
        filter = {username: username};
      }

      var n = this.params.n;
      var records = n
      if (n != undefined) {
        records = Math.ceil(n/20);
      }
      console.log ("records: " + records)
      var samples = Samples.find(filter, {sort: {created_at: -1}, limit: records});
      var l = [];
      samples.forEach(function (s) {
        l = l.concat(s.samples.reverse());
      });

      if (n != undefined) {
        l = l.slice(0,n);
      }

      l.reverse()

      //this.response.writeHead(200, {'Content-Type': 'text/html'});
      this.response.writeHead(200, {'Content-Type': 'application/json', 'Content-Disposition': 'attachment;'});
      this.response.end(JSON.stringify(l));
    }
  });
});
