/* Firebase.js
   Simple wrapper to initialize firebase and expose `db`.
   Uses compat builds loaded in index.html for minimal code changes.
*/
(function(window){
  const firebaseConfig = {
      apiKey: "AIzaSyCcZa-fnSwdD36rB_DAR-SSfFlzH2fqcPc",
  authDomain: "lordninetimer.firebaseapp.com",
  databaseURL: "https://lordninetimer-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "lordninetimer",
  storageBucket: "lordninetimer.firebasestorage.app",
  messagingSenderId: "462837939255",
  appId: "1:462837939255:web:dee141d630d5d9b94a53b2"
};

  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }

  const db = firebase.database();

  window.FirebaseModule = {
    db
  };
})(window);