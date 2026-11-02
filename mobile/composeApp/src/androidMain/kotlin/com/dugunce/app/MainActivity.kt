package com.dugunce.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.dugunce.app.api.ApiClient
import com.dugunce.app.data.Repository
import com.dugunce.app.data.TokenStore
import com.russhwolf.settings.SharedPreferencesSettings

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        val settings = SharedPreferencesSettings(
            getSharedPreferences("dugunce", MODE_PRIVATE),
        )
        val tokens = TokenStore(settings)
        val api = ApiClient(tokenProvider = { tokens.accessToken })
        val repository = Repository(api, tokens)

        setContent {
            App(repository = repository, tokens = tokens)
        }
    }
}
