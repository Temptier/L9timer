package com.example.bosstimers;

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

        // Allow mixed content (http + https) if your site is not https
        webSettings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        // Ensure links open inside the WebView
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedError(WebView view, int errorCode,
                                        String description, String failingUrl) {
                super.onReceivedError(view, errorCode, description, failingUrl);
                // Log or show error for debugging
                view.loadData("<h1>Load Error</h1><p>" + description + "</p>",
                        "text/html", "UTF-8");
            }
        });

        // Load your hosted webpage (replace with your actual link)
        webView.loadUrl("https://temptier.github.io/L9S9BossTimer/");

        setContentView(webView);
    }
}