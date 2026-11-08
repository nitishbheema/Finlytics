plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "in.finlytics.autotrack"
    compileSdk = 36

    defaultConfig {
        applicationId = "in.finlytics.autotrack"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.core:core-ktx:1.16.0")
    implementation("androidx.work:work-runtime-ktx:2.10.1")
    testImplementation("junit:junit:4.13.2")
}
