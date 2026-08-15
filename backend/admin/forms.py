"""
Forms for the admin Settings page (profile information + password change).
"""

from django import forms
from django.contrib.auth import get_user_model

User = get_user_model()


class ProfileForm(forms.ModelForm):
    """Update full name, email, and profile picture on the logged-in account."""

    remove_photo = forms.BooleanField(
        required=False,
        label='Remove current photo',
        help_text='Tick this to delete the uploaded profile picture.',
    )

    class Meta:
        model = User
        fields = ['first_name', 'last_name', 'email', 'profile_picture']
        widgets = {
            'profile_picture': forms.ClearableFileInput(attrs={'accept': 'image/*'}),
        }

    def clean_email(self):
        email = self.cleaned_data['email'].strip().lower()
        other = User.objects.filter(email=email).exclude(pk=self.instance.pk)
        if other.exists():
            raise forms.ValidationError('An account with this email already exists.')
        return email
