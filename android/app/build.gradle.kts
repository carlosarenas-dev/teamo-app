plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// El plugin de Google solo se aplica si ya existe el google-services.json. Asi el
// proyecto compila y se puede probar todo antes de crear el proyecto de Firebase.
if (file("google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
}

android {
    namespace = "com.woop"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.woop"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"

        // La URL del servidor se configura en android/gradle.properties (woop.baseUrl)
        buildConfigField(
            "String",
            "BASE_URL",
            "\"${project.findProperty("woop.baseUrl") ?: "https://woop.example.workers.dev"}\"",
        )
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
        debug {
            // Para apuntar al `wrangler dev` de la laptop por la red local.
            isDebuggable = true
        }
    }

    buildFeatures {
        viewBinding = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.constraintlayout:constraintlayout:2.2.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.work:work-runtime-ktx:2.10.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")

    // FCM. Sin google-services.json queda inerte, no rompe la compilacion.
    implementation(platform("com.google.firebase:firebase-bom:33.7.0"))
    implementation("com.google.firebase:firebase-messaging")
}
