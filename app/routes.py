# app/routes.py
from flask import Blueprint, render_template, redirect, url_for, flash, request
from flask_login import login_user, logout_user, login_required, current_user
from flask_wtf import FlaskForm
from wtforms import StringField, PasswordField, BooleanField, SubmitField
from wtforms.validators import DataRequired
from app.user import User
from app import db
from flask_mail import Message
from app import mail
import smtplib
from email.message import EmailMessage
import os
from flask import current_app



main = Blueprint('main', __name__)


# --- Simple Login Form ---
class LDAPLoginForm(FlaskForm):
    username = StringField('Username', validators=[DataRequired()])
    password = PasswordField('Password', validators=[DataRequired()])
    remember_me = BooleanField('Remember Me')
    submit = SubmitField('Log In')


# --- 1. Login Page ---
@main.route('/', methods=['GET', 'POST'])
def index():
    if current_user.is_authenticated:
        return redirect(url_for('main.hub'))

    form = LDAPLoginForm()
    if form.validate_on_submit():
        username = form.username.data.lower()
        password = form.password.data

        # Query local SQLite database
        user = User.query.filter_by(username=username).first()

        if user and user.check_password(password):
            login_user(user, remember=form.remember_me.data)
            return redirect(url_for('main.hub'))

        flash('Invalid username or password.', 'danger')

    return render_template('index.html', form=form)


# --- 2. The Hub (App Store) ---
@main.route('/hub')
@login_required
def hub():
    return render_template('protected.html')


# --- 3. Logout ---
@main.route('/logout')
@login_required
def logout():
    logout_user()
    flash('You have been logged out.', 'info')
    return redirect(url_for('main.index'))


# --- 4. Send Forgot Password Email ---

# def send_reset_email_raw(user_email, reset_link):
#     """Bypasses Flask-Mail and uses the corporate SMTP relay directly."""
#     smtp_server = os.getenv('MAIL_SERVER', 'vzsmtp.verizon.com')
#     smtp_port = int(os.getenv('MAIL_PORT', 25))
#     sender_email = os.getenv('SENDER_EMAIL', 'SecAAS-noreply@verizon.com')
#
#     msg = EmailMessage()
#     msg.set_content(
#         f"To reset your password, visit the following link:\n{reset_link}\n\nIf you did not make this request, simply ignore this email and no changes will be made.")
#     msg['Subject'] = 'SecAAS Password Reset Request'
#     msg['From'] = sender_email
#     msg['To'] = user_email
#
#     try:
#         with smtplib.SMTP(smtp_server, smtp_port) as server:
#             server.send_message(msg)
#         return True
#     except Exception as e:
#         current_app.logger.error(f"Failed to send password email via smtplib: {e}")
#         return False


#
# @main.route('/forgot-password', methods=['GET', 'POST'])
# def forgot_password():
#     if current_user.is_authenticated:
#         return redirect(url_for('main.hub'))
#
#     from app.forms import ForgotPasswordForm
#     form = ForgotPasswordForm()
#
#     if form.validate_on_submit():
#         user = User.query.filter_by(username=form.username.data.lower()).first()
#
#         if user and user.email:
#             # Generate the secure token and the URL
#             token = user.get_reset_token()
#             reset_link = url_for('main.reset_password', token=token, _external=True)
#
#             # Send the email using YOUR custom corporate relay function
#             send_reset_email_raw(user.email, reset_link)
#
#             flash('An email has been sent with instructions to reset your password.', 'info')
#         else:
#             flash('If an account with that VZID exists and has an email, a reset link has been sent.', 'info')
#
#         return redirect(url_for('main.index'))
#
#     return render_template('forgot_password.html', form=form)


# @main.route('/forgot-password', methods=['GET', 'POST'])
# def forgot_password():
#     if current_user.is_authenticated:
#         return redirect(url_for('main.hub'))
#
#     from app.forms import ForgotPasswordForm
#     form = ForgotPasswordForm()
#
#     if form.validate_on_submit():
#         username_submitted = form.username.data.lower()
#         print(f"\n--- [DEBUG] FORGOT PASSWORD TRIGGERED FOR: {username_submitted} ---")
#
#         user = User.query.filter_by(username=username_submitted).first()
#
#         if user:
#             print(f"[DEBUG] User found! Saved email is: '{user.email}'")
#             if user.email:
#                 token = user.get_reset_token()
#                 reset_link = url_for('main.reset_password', token=token, _external=True)
#
#
#                 print(f"[DEBUG] Attempting to contact {current_app.config['MAIL_SERVER']} via Flask-Mail...")
#
#                 try:
#                     msg = Message('SecAAS Password Reset Request',
#                                   recipients=[user.email])
#                     msg.body = f"To reset your password, visit the following link:\n{reset_link}\n\nIf you did not make this request, simply ignore this email."
#
#                     mail.send(msg)
#                     print(f"[DEBUG] SUCCESS! Mail sent through {current_app.config['MAIL_SERVER']}.")
#                     flash('An email has been sent with instructions to reset your password.', 'info')
#
#                 except Exception as e:
#                     print(f"[DEBUG] FAILED! Flask-Mail threw an error: {e}")
#                     flash('Error communicating with the mail server.', 'danger')
#             else:
#                 print(f"[DEBUG] ABORTING: User has NO email address!")
#                 flash('If an account with that VZID exists and has an email, a reset link has been sent.', 'info')
#         else:
#             print(f"[DEBUG] ABORTING: No user found matching '{username_submitted}'")
#             flash('If an account with that VZID exists and has an email, a reset link has been sent.', 'info')
#
#         print("---------------------------------------------------\n")
#         return redirect(url_for('main.index'))
#
#     return render_template('forgot_password.html', form=form)



def send_reset_email_direct(to_email, reset_link):
    """
    Sends an email using the raw smtplib method from your previous working project.
    """
    smtp_server = os.getenv('SMTP_SERVER')
    smtp_port = int(os.getenv('SMTP_PORT'))
    sender_email = os.getenv('SENDER_EMAIL')

    # Construct the email exactly like your old script
    msg = EmailMessage()
    msg.set_content(
        f"Hello,\n\n"
        f"A password reset was requested for your account.\n\n"
        f"To securely reset your password, visit the following link:\n{reset_link}\n\n"
        f"If you did not make this request, simply ignore this email.\n\n"
        f"Thank you."
    )
    msg['Subject'] = 'SecAAS Password Reset Request'
    msg['From'] = sender_email
    msg['To'] = to_email

    print(f"\n[DEBUG] Connecting to {smtp_server}:{smtp_port} to send email...")
    try:
        # Connect to the SMTP server and send the message
        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.send_message(msg)

        print(f"[DEBUG] ✅ Password reset email sent successfully to {to_email}.")
        return True
    except Exception as e:
        print(f"[DEBUG] ❌ Failed to send email via smtplib: {e}")
        return False


@main.route('/forgot-password', methods=['GET', 'POST'])
def forgot_password():
    if current_user.is_authenticated:
        return redirect(url_for('main.hub'))

    from app.forms import ForgotPasswordForm
    form = ForgotPasswordForm()

    if form.validate_on_submit():
        username_submitted = form.username.data.lower()
        print(f"\n--- [DEBUG] FORGOT PASSWORD TRIGGERED FOR: {username_submitted} ---")

        user = User.query.filter_by(username=username_submitted).first()

        if user:
            print(f"[DEBUG] User found! Saved email is: '{user.email}'")
            if user.email:
                # Generate the secure token and the URL
                token = user.get_reset_token()
                reset_link = url_for('main.reset_password', token=token, _external=True)

                # Use YOUR working function
                success = send_reset_email_direct(user.email, reset_link)

                if success:
                    flash('An email has been sent with instructions to reset your password.', 'info')
                else:
                    flash('Error communicating with the Verizon mail server. Check terminal.', 'danger')
            else:
                print(f"[DEBUG] ABORTING: User has NO email address!")
                flash('If an account with that VZID exists and has an email, a reset link has been sent.', 'info')
        else:
            print(f"[DEBUG] ABORTING: No user found matching '{username_submitted}'")
            flash('If an account with that VZID exists and has an email, a reset link has been sent.', 'info')

        print("---------------------------------------------------\n")
        return redirect(url_for('main.index'))

    return render_template('forgot_password.html', form=form)


# --- 5. Actually Reset the Password ---
@main.route('/reset_password/<token>', methods=['GET', 'POST'])
def reset_password(token):
    if current_user.is_authenticated:
        return redirect(url_for('main.hub'))

    user = User.verify_reset_token(token)
    if user is None:
        flash('That is an invalid or expired token', 'danger')
        return redirect(url_for('main.forgot_password'))

    from app.forms import ResetPasswordForm
    form = ResetPasswordForm()

    if form.validate_on_submit():
        user.set_password(form.password.data)
        db.session.commit()
        flash('Your password has been updated! You are now able to log in', 'success')
        return redirect(url_for('main.index'))

    # Reusing the forgot_password template for speed, but passing the Reset form
    return render_template('forgot_password.html', form=form, title='Reset Password')