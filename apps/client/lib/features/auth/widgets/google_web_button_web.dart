import 'package:flutter/widgets.dart';
import 'package:google_sign_in_web/web_only.dart' as gsi;

/// Web : bouton rendu par Google Identity Services (thème sombre, pleine largeur).
Widget buildGoogleWebButton() => gsi.renderButton(
      configuration: gsi.GSIButtonConfiguration(
        theme: gsi.GSIButtonTheme.filledBlack,
        size: gsi.GSIButtonSize.large,
        text: gsi.GSIButtonText.continueWith,
        shape: gsi.GSIButtonShape.pill,
        locale: 'fr',
      ),
    );
