package com.example.bosstimers;

import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebSettings;
import androidx.appcompat.app.AppCompatActivity;

public class MainActivity extends AppCompatActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WebView webView = new WebView(this);

        // Enable JavaScript & DOM storage
        WebSettings webSettings = webView.getSettings();
        webSettings.setJavaScriptEnabled(true);
        webSettings.setDomStorageEnabled(true);

        // Allow mixed content (http + https)
        webSettings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        // Ensure links open inside the WebView
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedError(WebView view, int errorCode,
                                        String description, String failingUrl) {
                super.onReceivedError(view, errorCode, description, failingUrl);
                view.loadData("<h1>Load Error</h1><p>" + description + "</p>",
                        "text/html", "UTF-8");
            }
        });

        // Load your hosted webpage
        webView.loadUrl("https://temptier.github.io/L9S9BossTimer/");

        setContentView(webView);

        // 🚀 Start the foreground service (runs in background with notification)
        Intent serviceIntent = new Intent(this, TimerService.class);
        startForegroundService(serviceIntent);
    }
}