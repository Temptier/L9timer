/* Firebase.js
   Simple wrapper to initialize firebase and expose `db`.
   Uses compat builds loaded in index.html for minimal code changes.
*/
(function(window){
  const firebaseConfig = {
    apiKey: "AIzaSyAD5I3c-SZ2LRuYG_6kaMgEkjvOtP1d3pU",
    authDomain: "synchronizedtimer-57ef0.firebaseapp.com",
    databaseURL: "https://synchronizedtimer-57ef0-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "synchronizedtimer-57ef0",
    storageBucket: "synchronizedtimer-57ef0.appspot.com",
    messagingSenderId: "812068089886",
    appId: "1:812068089886:web:61e95179ca3ec2251e7e0f"
  };

  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }

  const db = firebase.database();

  window.FirebaseModule = {
    db
  };
})(window);