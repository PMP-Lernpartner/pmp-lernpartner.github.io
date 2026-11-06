package io.github.pmplernpartner;

import android.os.Bundle;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Startbildschirm "Haken im Kreis" (styles.xml, AppTheme.NoActionBarLaunch)
        SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);
    }
}
