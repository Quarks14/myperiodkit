from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.contrib.auth.validators import UnicodeUsernameValidator
from rest_framework import serializers
from .roles import ROLES

User = get_user_model()


def check_new_password(value, user=None):
    if len(value) < 12:
        raise serializers.ValidationError('Use at least 12 characters.')
    try:
        validate_password(value, user=user)
    except DjangoValidationError as exc:
        raise serializers.ValidationError(list(exc.messages)) from exc
    return value


class StaffCreateSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150, validators=[UnicodeUsernameValidator()])
    email = serializers.EmailField(required=False, allow_blank=True)
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    role = serializers.ChoiceField(choices=ROLES)
    password = serializers.CharField(write_only=True, trim_whitespace=False, style={'input_type': 'password'})
    is_active = serializers.BooleanField(default=True)

    def validate_username(self, value):
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError('This username is already in use.')
        return value

    def validate(self, attrs):
        candidate = User(username=attrs['username'], email=attrs.get('email', ''), first_name=attrs.get('first_name', ''), last_name=attrs.get('last_name', ''))
        check_new_password(attrs['password'], user=candidate)
        return attrs


class StaffUpdateSerializer(serializers.Serializer):
    email = serializers.EmailField(required=False, allow_blank=True)
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    role = serializers.ChoiceField(choices=ROLES, required=False)
    is_active = serializers.BooleanField(required=False)


class PasswordResetSerializer(serializers.Serializer):
    password = serializers.CharField(write_only=True, trim_whitespace=False, style={'input_type': 'password'})

    def validate_password(self, value):
        return check_new_password(value, user=self.context['target'])


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True, trim_whitespace=False)
    new_password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate(self, attrs):
        user = self.context['request'].user
        if not user.check_password(attrs['current_password']):
            raise serializers.ValidationError({'current_password': ['The current password is incorrect.']})
        if attrs['current_password'] == attrs['new_password']:
            raise serializers.ValidationError({'new_password': ['Choose a different password.']})
        check_new_password(attrs['new_password'], user=user)
        return attrs
